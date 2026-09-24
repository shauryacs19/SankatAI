// Voice input over Amazon Transcribe Streaming — framework-neutral, used by the
// web and mobile clients. Platform code owns only the microphone: it pushes
// 16 kHz mono Int16 PCM into a session created here. Everything else — the
// WebSocket, AWS event-stream framing, transcript assembly, timers, retries —
// lives here once.
//
// Flow: POST /api/voice/session -> presigned wss URL (60 s to connect) ->
// audio goes DIRECTLY to Transcribe, never through our backend -> the final
// text lands in the chat input for the user to review, edit and send.

import { EventStreamCodec } from '@smithy/eventstream-codec'

// Transcribe identifies which of these is spoken (the backend's
// VOICE_LANGUAGE_OPTIONS); labels are for the detected-language chip.
export const VOICE_LANGUAGES = [
  { code: 'en-IN', label: 'English' },
  { code: 'hi-IN', label: 'Hindi' },
]
export const voiceLanguageLabel = (code) => VOICE_LANGUAGES.find((l) => l.code === code)?.label || code || ''
export const VOICE_SAMPLE_RATE = 16000
export const VOICE_MAX_SECONDS = 60 // overridden by the session's maxSeconds
export const VOICE_SILENCE_MS = 3000

const FRAME_SAMPLES = VOICE_SAMPLE_RATE / 10 // 100 ms per AudioEvent (AWS: 50–200 ms)
const MAX_BUFFERED_SAMPLES = VOICE_SAMPLE_RATE * 10 // audio held while connecting
const SPEECH_RMS = 400 // Int16 RMS (~ -38 dBFS) above which a frame counts as speech
export const VOICE_FINALIZE_MS = 1500 // after Stop: wait at most this long for the last final
export const VOICE_LEVEL_THRESHOLD = 0.02 // smoothed float RMS above which the user is speaking
const LEVEL_SMOOTHING = 0.2 // EMA factor per level sample
const LEVEL_HOLD_MS = 150 // the speaking flag flips only after holding this long
const EXPIRY_MARGIN_MS = 5000

// ---------------------------------------------------------------- utf-8 ----
// Hermes (React Native) has TextEncoder but not always TextDecoder.
const utf8Encode = (s) => {
  if (typeof TextEncoder !== 'undefined') return new TextEncoder().encode(s)
  const out = []
  for (const ch of s) {
    const cp = ch.codePointAt(0)
    if (cp < 0x80) out.push(cp)
    else if (cp < 0x800) out.push(0xc0 | (cp >> 6), 0x80 | (cp & 0x3f))
    else if (cp < 0x10000) out.push(0xe0 | (cp >> 12), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
    else out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f))
  }
  return Uint8Array.from(out)
}
export const utf8Decode = (bytes) => {
  if (typeof TextDecoder !== 'undefined') return new TextDecoder().decode(bytes)
  let out = ''
  for (let i = 0; i < bytes.length;) {
    const b = bytes[i]
    const n = b < 0x80 ? 1 : b < 0xe0 ? 2 : b < 0xf0 ? 3 : 4
    let cp = n === 1 ? b : b & (0xff >> (n + 1))
    for (let k = 1; k < n; k++) cp = (cp << 6) | (bytes[i + k] & 0x3f)
    out += String.fromCodePoint(cp)
    i += n
  }
  return out
}

// ---------------------------------------------------------------- audio ----
const toInt16 = (s) => {
  const c = s > 1 ? 1 : s < -1 ? -1 : s
  return c < 0 ? c * 0x8000 : c * 0x7fff
}

// Stateful Float32 -> 16 kHz Int16 downsampler. Averages each output sample's
// input window (a cheap low-pass against aliasing) and carries the fractional
// remainder between chunks, so streaming chunk by chunk gives the same output
// as converting the whole recording at once.
export function createDownsampler(inputRate, outputRate = VOICE_SAMPLE_RATE) {
  const ratio = inputRate / outputRate
  if (!(ratio >= 1)) throw new Error(`Cannot downsample ${inputRate} Hz to ${outputRate} Hz`)
  let carry = new Float32Array(0)
  let pos = 0 // fractional read position into carry+chunk
  return (chunk) => {
    const buf = new Float32Array(carry.length + chunk.length)
    buf.set(carry)
    buf.set(chunk, carry.length)
    const count = Math.floor((buf.length - pos) / ratio)
    const out = new Int16Array(count)
    for (let i = 0; i < count; i++) {
      const from = Math.floor(pos + i * ratio)
      const to = Math.max(from + 1, Math.floor(pos + (i + 1) * ratio))
      let sum = 0
      for (let j = from; j < to; j++) sum += buf[j]
      out[i] = toInt16(sum / (to - from))
    }
    const end = pos + count * ratio
    const used = Math.floor(end)
    carry = buf.slice(used)
    pos = end - used
    return out
  }
}

const rms = (pcm) => {
  if (!pcm.length) return 0
  let sum = 0
  for (let i = 0; i < pcm.length; i++) sum += pcm[i] * pcm[i]
  return Math.sqrt(sum / pcm.length)
}

// --------------------------------------------------------- event stream ----
const codec = new EventStreamCodec(utf8Decode, utf8Encode)
const str = (value) => ({ type: 'string', value })

// One AudioEvent frame. An empty body tells Transcribe the audio has ended.
export const encodeAudioEvent = (pcm) =>
  codec.encode({
    headers: {
      ':message-type': str('event'),
      ':event-type': str('AudioEvent'),
      ':content-type': str('application/octet-stream'),
    },
    body: pcm instanceof Uint8Array ? pcm : new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
  })

// -> { kind: 'transcript', results } | { kind: 'error', code, message }
export function decodeTranscribeMessage(bytes) {
  const { headers, body } = codec.decode(bytes)
  let json = {}
  try { json = body.length ? JSON.parse(utf8Decode(body)) : {} } catch { /* non-JSON body */ }
  if (headers[':message-type']?.value === 'event') {
    return { kind: 'transcript', results: json.Transcript?.Results || [] }
  }
  return {
    kind: 'error',
    code: headers[':exception-type']?.value || headers[':error-code']?.value || 'TranscribeError',
    message: json.Message || json.message || headers[':error-message']?.value || '',
  }
}

// ---------------------------------------------------------------- level ----
export const floatRms = (buf) => {
  let sum = 0
  for (let i = 0; i < buf.length; i++) sum += buf[i] * buf[i]
  return buf.length ? Math.sqrt(sum / buf.length) : 0
}
export const pcmRms = (pcm) => rms(pcm) / 32768

// Smooths per-sample RMS (float scale, 0..1) with an EMA and derives a
// `speaking` flag that only flips after holding for LEVEL_HOLD_MS, so the
// ripple doesn't flicker between words. Drives the listening animation only;
// silence auto-stop uses the session's own detector.
export function createLevelMeter({ threshold = VOICE_LEVEL_THRESHOLD, holdMs = LEVEL_HOLD_MS } = {}) {
  let level = 0
  let speaking = false
  let flipSince = null
  return {
    update(sampleRms, t) {
      level += LEVEL_SMOOTHING * (sampleRms - level)
      const above = level > threshold
      if (above === speaking) flipSince = null
      else if (flipSince === null) flipSince = t
      if (flipSince !== null && t - flipSince >= holdMs) { speaking = above; flipSince = null }
      return { level, speaking }
    },
  }
}

// ---------------------------------------------------------- state machine ----
// idle ──mic──> recording ──stop──> finalizing ──final──> review
// recording/finalizing ──cancel──> review if text remains, else idle
// review ──send / clear──> idle      review ──mic──> recording (appends)
// `text` is what the input will hold after the event.
export function nextVoiceState(state, event, { text = '' } = {}) {
  const hasText = String(text).trim().length > 0
  const live = state === 'recording' || state === 'finalizing'
  switch (event) {
    case 'mic': return state === 'idle' || state === 'review' ? 'recording' : state
    case 'stop': return state === 'recording' ? 'finalizing' : state
    case 'final':
    case 'cancel': return live ? (hasText ? 'review' : 'idle') : state
    case 'send':
    case 'clear': return state === 'review' ? 'idle' : state
    default: return state
  }
}

export function voiceFlags(state, { text = '', sending = false } = {}) {
  const popupOpen = state === 'recording' || state === 'finalizing'
  return { popupOpen, inputReadOnly: popupOpen, sendDisabled: popupOpen || sending || !String(text).trim() }
}

// Text typed before recording stays in front; the transcript is appended.
export const joinVoiceText = (base, transcript) =>
  [String(base || '').trim(), String(transcript || '').trim()].filter(Boolean).join(' ')

// ----------------------------------------------------------- transcript ----
// Partial results for a segment are replaced until it becomes final. With
// language identification each result carries LanguageCode and (usually)
// LanguageIdentification scores — on partials too, and a stream can end with
// its last segment still partial, so both count toward the detected language.
const langOf = (r) => ({ code: r.LanguageCode || '', scores: Array.isArray(r.LanguageIdentification) ? r.LanguageIdentification : null })

// Highest total confidence across segments; a segment without scores counts
// as one vote for its LanguageCode.
export function pickLanguage(langs) {
  const tally = new Map()
  const add = (code, v) => { if (code) tally.set(code, (tally.get(code) || 0) + v) }
  for (const l of langs) {
    if (l.scores?.length) l.scores.forEach((s) => add(s.LanguageCode, Number(s.Score) || 0))
    else add(l.code, 1)
  }
  let best = ''
  let max = 0
  for (const [code, v] of tally) if (v > max) { best = code; max = v }
  return best
}

export function createTranscript() {
  const finals = [] // { text, lang }
  const partials = new Map() // ResultId -> { text, lang }
  return {
    apply(results) {
      for (const r of results) {
        const seg = { text: (r.Alternatives?.[0]?.Transcript || '').trim(), lang: langOf(r) }
        if (r.IsPartial) partials.set(r.ResultId, seg)
        else {
          partials.delete(r.ResultId)
          if (seg.text) finals.push(seg)
        }
      }
    },
    get finalText() { return finals.map((f) => f.text).join(' ') },
    get partialText() { return [...partials.values()].map((p) => p.text).filter(Boolean).join(' ') },
    get pending() { return partials.size },
    get text() { return [...finals, ...partials.values()].map((x) => x.text).filter(Boolean).join(' ') },
    get language() { return pickLanguage([...finals, ...partials.values()].filter((x) => x.text).map((x) => x.lang)) },
  }
}

const voiceError = (code, message) => Object.assign(new Error(message), { code })

// ---------------------------------------------------------------- session ----
// One recording. Call start() once the microphone is live, push PCM with
// sendPcm(), and stop() to finish. The session also stops itself after
// `silenceMs` without speech, at the session's max duration, or on error.
//
// opts:
//   getSession() -> Promise<{ url, expiresIn, maxSeconds }> (Transcribe picks the language)
//   WebSocketImpl (default: global WebSocket), silenceMs, now()
//   onText(text, {final, partial, language})  live transcript; split for display
//   onState(state)        'recording' | 'processing' | 'idle'
//   onError(err)          err.code: 'session' | 'network' | 'transcribe'
//   stopCapture()         release the microphone (called exactly once)
//   onFinal(text, {error, language}) called EXACTLY once per session (never after cancel)
export function createVoiceSession(opts) {
  const {
    getSession, silenceMs = VOICE_SILENCE_MS,
    WebSocketImpl = globalThis.WebSocket, now = () => Date.now(),
    onText = () => {}, onState = () => {}, onError = () => {}, stopCapture = () => {}, onFinal = () => {},
  } = opts

  const transcript = createTranscript()
  let session = null // { url, expiresIn, maxSeconds, issuedAt }
  let pending = null // in-flight getSession
  let ws = null
  let opened = false
  let stopping = false
  let done = false
  let queued = [] // Int16Array chunks awaiting a frame / the socket
  let queuedLen = 0
  let startedAt = 0
  let lastSpeechAt = 0
  let tick = null
  let endTimer = null
  let captureStopped = false

  const releaseMic = () => {
    if (captureStopped) return
    captureStopped = true
    try { stopCapture() } catch { /* already released */ }
  }

  // `silent`: cancelled — release everything, report nothing.
  const finish = (error = null, silent = false) => {
    if (done) return
    done = true
    clearInterval(tick)
    clearTimeout(endTimer)
    releaseMic()
    if (ws) {
      ws.onopen = ws.onmessage = ws.onerror = ws.onclose = null
      try { ws.close() } catch { /* already closed */ }
    }
    if (silent) return
    if (error) onError(error)
    onState('idle')
    onFinal(transcript.text.trim(), { error: Boolean(error), language: transcript.language })
  }

  const fetchSession = () => {
    pending ??= Promise.resolve(getSession())
      .then((s) => { session = { ...s, issuedAt: now() }; return session })
      .finally(() => { pending = null })
    return pending
  }
  const fresh = (s) => s && now() < s.issuedAt + (s.expiresIn || 60) * 1000 - EXPIRY_MARGIN_MS

  const frame = (pcm) => ws.send(encodeAudioEvent(pcm))

  // Sends whole 100 ms frames; with `all`, the remainder too.
  const flush = (all = false) => {
    if (!opened) return
    while (queuedLen >= FRAME_SAMPLES || (all && queuedLen > 0)) {
      const n = Math.min(FRAME_SAMPLES, queuedLen)
      const out = new Int16Array(n)
      let filled = 0
      while (filled < n) {
        const head = queued[0]
        const take = Math.min(head.length, n - filled)
        out.set(head.subarray(0, take), filled)
        filled += take
        if (take === head.length) queued.shift()
        else queued[0] = head.subarray(take)
      }
      queuedLen -= n
      frame(out)
    }
  }

  const endStream = () => {
    flush(true)
    frame(new Uint8Array(0)) // end of audio: Transcribe sends the last finals, then closes
    clearTimeout(endTimer)
    endTimer = setTimeout(() => finish(), VOICE_FINALIZE_MS)
  }

  const connect = async (attempt) => {
    let s
    try {
      s = fresh(session) ? session : await fetchSession()
    } catch (e) {
      finish(voiceError('session', e?.message || 'Could not start voice input.'))
      return
    }
    if (done) return
    try {
      ws = new WebSocketImpl(s.url)
    } catch {
      finish(voiceError('network', 'Could not connect to the speech service.'))
      return
    }
    ws.binaryType = 'arraybuffer'
    ws.onopen = () => {
      opened = true
      if (stopping) endStream()
      else flush()
    }
    ws.onmessage = (ev) => {
      let msg
      try { msg = decodeTranscribeMessage(new Uint8Array(ev.data)) } catch { return }
      if (msg.kind === 'error') {
        finish(voiceError('transcribe', msg.message || msg.code))
        return
      }
      const before = transcript.text
      transcript.apply(msg.results)
      if (transcript.text !== before) {
        lastSpeechAt = now()
        onText(transcript.text, { final: transcript.finalText, partial: transcript.partialText, language: transcript.language })
      }
      // After Stop, the last final (nothing partial left) ends it early.
      if (stopping && transcript.pending === 0 && msg.results.some((r) => !r.IsPartial)) finish()
    }
    ws.onerror = () => {} // the close event that follows carries the outcome
    ws.onclose = (ev) => {
      if (done) return
      if (!opened) {
        // Handshake refused: most often the 60 s presigned URL expired. Get a
        // new one and try once more before giving up.
        if (attempt === 0) {
          session = null
          ws = null
          connect(1)
          return
        }
        finish(voiceError('network', 'Could not connect to the speech service.'))
        return
      }
      if (stopping) finish()
      else finish(ev?.code === 1000 ? null : voiceError('network', 'The voice connection was lost.'))
    }
  }

  const stop = () => {
    if (done || stopping) return
    stopping = true
    releaseMic()
    onState('processing')
    if (opened) endStream()
    else endTimer = setTimeout(() => finish(), VOICE_FINALIZE_MS) // still connecting
  }

  const start = () => {
    if (done || tick || stopping) return
    startedAt = lastSpeechAt = now()
    onState('recording')
    tick = setInterval(() => {
      if (done || stopping) return
      const t = now()
      const maxMs = (session?.maxSeconds || VOICE_MAX_SECONDS) * 1000
      if (t - startedAt >= maxMs || t - lastSpeechAt >= silenceMs) stop()
    }, 250)
    connect(0)
  }

  const sendPcm = (pcm) => {
    if (done || stopping || !pcm?.length) return
    if (rms(pcm) >= SPEECH_RMS) lastSpeechAt = now()
    if (!opened && queuedLen + pcm.length > MAX_BUFFERED_SAMPLES) return
    queued.push(pcm)
    queuedLen += pcm.length
    flush()
  }

  // Abandon with no callbacks (e.g. unmount); the mic is still released.
  const cancel = () => {
    queued = []
    queuedLen = 0
    finish(null, true)
  }

  // prepare(): optional — fetch the presigned URL while the permission prompt is open.
  const prepare = () => { fetchSession().catch(() => {}) }

  return {
    prepare, start, sendPcm, stop, cancel,
    get state() { return done ? 'idle' : stopping ? 'processing' : 'recording' },
  }
}
