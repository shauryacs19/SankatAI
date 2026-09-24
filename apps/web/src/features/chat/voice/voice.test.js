import { crc32 } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventStreamCodec } from '@smithy/eventstream-codec'
import {
  createDownsampler, createLevelMeter, createTranscript, createVoiceSession, decodeTranscribeMessage, encodeAudioEvent,
  joinVoiceText, nextVoiceState, pickLanguage, voiceFlags, voiceLanguageLabel, VOICE_FINALIZE_MS,
} from '@sankatai/shared/voice'
import { startLevelMeter } from './useAudioLevel'

const codec = new EventStreamCodec((b) => new TextDecoder().decode(b), (s) => new TextEncoder().encode(s))
const str = (value) => ({ type: 'string', value })

const transcriptEvent = (results) => codec.encode({
  headers: { ':message-type': str('event'), ':event-type': str('TranscriptEvent'), ':content-type': str('application/json') },
  body: new TextEncoder().encode(JSON.stringify({ Transcript: { Results: results } })),
})
const exceptionEvent = (type, message) => codec.encode({
  headers: { ':message-type': str('exception'), ':exception-type': str(type), ':content-type': str('application/json') },
  body: new TextEncoder().encode(JSON.stringify({ Message: message })),
})
const result = (id, text, partial) => ({ ResultId: id, IsPartial: partial, Alternatives: [{ Transcript: text }] })

describe('PCM downsampler', () => {
  it('turns 48 kHz float into 16 kHz Int16 (3:1)', () => {
    const out = createDownsampler(48000)(new Float32Array(480).fill(0.5))
    expect(out).toBeInstanceOf(Int16Array)
    expect(out.length).toBe(160)
    expect(out.every((v) => v === Math.trunc(0.5 * 0x7fff))).toBe(true)
  })

  it('handles a non-integer ratio (44.1 kHz) identically whether streamed or whole', () => {
    const input = Float32Array.from({ length: 4410 }, (_, i) => Math.sin(i / 7))
    const whole = createDownsampler(44100)(input)
    const streamed = createDownsampler(44100)
    const parts = [input.subarray(0, 1000), input.subarray(1000, 1001), input.subarray(1001)].map(streamed)
    const joined = Int16Array.from(parts.flatMap((p) => Array.from(p)))
    expect(whole.length).toBe(1600)
    expect(joined).toEqual(whole)
  })

  it('clips out-of-range samples and keeps silence at zero', () => {
    const out = createDownsampler(16000)(Float32Array.from([2, -2, 0, 1, -1]))
    expect(Array.from(out)).toEqual([32767, -32768, 0, 32767, -32768])
  })

  it('refuses to upsample', () => {
    expect(() => createDownsampler(8000)).toThrow()
  })
})

describe('event-stream encoder', () => {
  it('frames PCM as an AudioEvent with valid prelude and message CRCs', () => {
    const pcm = Int16Array.from([1, -1, 256, -32768])
    const frame = encodeAudioEvent(pcm)
    const view = new DataView(frame.buffer, frame.byteOffset, frame.byteLength)
    expect(view.getUint32(0)).toBe(frame.length)
    expect(view.getUint32(8)).toBe(crc32(frame.subarray(0, 8)))
    expect(view.getUint32(frame.length - 4)).toBe(crc32(frame.subarray(0, frame.length - 4)))

    const { headers, body } = codec.decode(frame)
    expect(headers[':message-type'].value).toBe('event')
    expect(headers[':event-type'].value).toBe('AudioEvent')
    expect(headers[':content-type'].value).toBe('application/octet-stream')
    expect(Array.from(new Int16Array(body.buffer.slice(body.byteOffset, body.byteOffset + body.byteLength)))).toEqual([1, -1, 256, -32768])
  })

  it('encodes the end-of-stream signal as an empty body', () => {
    expect(codec.decode(encodeAudioEvent(new Uint8Array(0))).body.length).toBe(0)
  })

  it('decodes transcript events and exceptions', () => {
    const t = decodeTranscribeMessage(transcriptEvent([result('a', 'सीने में दर्द', false)]))
    expect(t).toEqual({ kind: 'transcript', results: [result('a', 'सीने में दर्द', false)] })
    expect(decodeTranscribeMessage(exceptionEvent('BadRequestException', 'bad'))).toEqual({ kind: 'error', code: 'BadRequestException', message: 'bad' })
  })
})

describe('transcript', () => {
  it('replaces partials, accumulates finals, and splits them for display', () => {
    const t = createTranscript()
    t.apply([result('a', 'chest', true)])
    t.apply([result('a', 'chest pain', true)])
    expect(t.text).toBe('chest pain')
    t.apply([result('a', 'Chest pain.', false), result('b', 'since', true)])
    expect(t.text).toBe('Chest pain. since')
    expect([t.finalText, t.partialText, t.pending]).toEqual(['Chest pain.', 'since', 1])
  })

  it('picks the detected language by total confidence, counting pending partials', () => {
    const lid = (hi, en) => [{ LanguageCode: 'hi-IN', Score: hi }, { LanguageCode: 'en-IN', Score: en }]
    const seg = (id, text, partial, code, scores) => ({ ...result(id, text, partial), LanguageCode: code, LanguageIdentification: scores })
    const t = createTranscript()
    t.apply([seg('a', 'मुझे', false, 'hi-IN', lid(0.9, 0.1))])
    t.apply([seg('b', 'fever', false, 'en-IN', lid(0.4, 0.6))])
    expect(t.language).toBe('hi-IN') // 1.3 vs 0.7, though each won one segment
    // A stream can end with its last segment still partial; it counts too.
    t.apply([seg('c', 'and a headache since morning', true, 'en-IN', lid(0.01, 0.99))])
    expect(t.language).toBe('en-IN')
    // Without scores, each segment is one vote for its LanguageCode.
    expect(pickLanguage([{ code: 'hi-IN' }, { code: 'en-IN' }, { code: 'hi-IN' }])).toBe('hi-IN')
    expect(pickLanguage([])).toBe('')
    expect(voiceLanguageLabel('hi-IN')).toBe('Hindi')
  })

  it('appends to text typed before recording', () => {
    expect(joinVoiceText('I have', ' fever ')).toBe('I have fever')
    expect(joinVoiceText('', '  ')).toBe('')
    expect(joinVoiceText(' typed ', '')).toBe('typed')
  })
})

describe('state machine', () => {
  it('idle -> recording -> finalizing -> review -> idle', () => {
    let s = nextVoiceState('idle', 'mic')
    expect(s).toBe('recording')
    s = nextVoiceState(s, 'stop')
    expect(s).toBe('finalizing')
    s = nextVoiceState(s, 'final', { text: 'chest pain' })
    expect(s).toBe('review')
    expect(nextVoiceState(s, 'send')).toBe('idle')
    expect(nextVoiceState(s, 'clear')).toBe('idle')
    expect(nextVoiceState(s, 'mic')).toBe('recording') // re-record appends
  })

  it('an empty final returns to idle; cancel keeps review only when text remains', () => {
    expect(nextVoiceState('finalizing', 'final', { text: '  ' })).toBe('idle')
    expect(nextVoiceState('recording', 'cancel', { text: '' })).toBe('idle')
    expect(nextVoiceState('recording', 'cancel', { text: 'typed before' })).toBe('review')
    expect(nextVoiceState('finalizing', 'cancel', { text: 'typed before' })).toBe('review')
  })

  it('send is disabled while the popup is open, while sending, and when empty', () => {
    expect(voiceFlags('recording', { text: 'x' })).toEqual({ popupOpen: true, inputReadOnly: true, sendDisabled: true })
    expect(voiceFlags('finalizing', { text: 'x' }).sendDisabled).toBe(true)
    expect(voiceFlags('review', { text: 'x' })).toEqual({ popupOpen: false, inputReadOnly: false, sendDisabled: false })
    expect(voiceFlags('review', { text: '   ' }).sendDisabled).toBe(true)
    expect(voiceFlags('review', { text: 'x', sending: true }).sendDisabled).toBe(true)
  })
})

describe('audio level', () => {
  it('flags speaking only above the threshold, after a 150 ms hold, and clears on silence', () => {
    const m = createLevelMeter()
    let t = 0
    const feed = (level, ms) => {
      let r
      for (const end = t + ms; t < end; t += 16) r = m.update(level, t)
      return r
    }
    expect(feed(0.01, 500).speaking).toBe(false) // below threshold
    expect(feed(0.2, 120).speaking).toBe(false) // above, but not held long enough yet
    expect(feed(0.2, 200).speaking).toBe(true)
    expect(feed(0, 100).speaking).toBe(true) // brief gap between words: still speaking
    expect(feed(0, 600).speaking).toBe(false)
  })

  it('reads the shared mic source through one analyser and cleans up rAF + nodes', () => {
    let amp = 0
    let t = 0
    const frames = []
    const analyser = { fftSize: 0, getFloatTimeDomainData: (buf) => buf.fill(amp), disconnect: vi.fn() }
    const ctx = { createAnalyser: vi.fn(() => analyser) }
    const source = { connect: vi.fn(), disconnect: vi.fn() }
    const onSpeaking = vi.fn()
    const onLevel = vi.fn()
    const caf = vi.fn()
    const stop = startLevelMeter({ ctx, source, onLevel, onSpeaking, raf: (fn) => frames.push(fn), caf, now: () => t })
    const run = (n) => { for (let i = 0; i < n; i++) { t += 16; frames.shift()() } }

    expect(source.connect).toHaveBeenCalledWith(analyser)
    run(20)
    expect(onSpeaking).not.toHaveBeenCalled()
    amp = 0.3
    run(30)
    expect(onSpeaking).toHaveBeenLastCalledWith(true)
    expect(onLevel.mock.calls.at(-1)[0]).toBeGreaterThan(0.5)
    amp = 0
    run(60)
    expect(onSpeaking).toHaveBeenLastCalledWith(false)

    stop()
    expect(caf).toHaveBeenCalledTimes(1)
    expect(source.disconnect).toHaveBeenCalledWith(analyser)
    expect(analyser.disconnect).toHaveBeenCalled()
    expect(ctx.createAnalyser).toHaveBeenCalledTimes(1)
  })
})

class FakeWebSocket {
  static instances = []
  constructor(url) { this.url = url; this.sent = []; FakeWebSocket.instances.push(this) }
  send(data) { this.sent.push(data) }
  close() { this.closed = true }
  open() { this.onopen?.() }
  receive(bytes) { this.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }) }
  serverClose(code = 1000) { this.onclose?.({ code }) }
}

const loud = () => new Int16Array(1600).fill(8000)

describe('voice session', () => {
  let onFinal, onText, getSession, stopCapture, onError

  const newSession = (extra = {}) => createVoiceSession({
    getSession, WebSocketImpl: FakeWebSocket, stopCapture, onError, onFinal, onText, ...extra,
  })
  const connected = async (s) => {
    s.start()
    await vi.advanceTimersByTimeAsync(0)
    const ws = FakeWebSocket.instances.at(-1)
    ws.open()
    return ws
  }

  beforeEach(() => {
    vi.useFakeTimers()
    FakeWebSocket.instances = []
    onFinal = vi.fn()
    onText = vi.fn()
    stopCapture = vi.fn()
    onError = vi.fn()
    getSession = vi.fn(async () => ({ url: 'wss://example/stream', expiresIn: 60, maxSeconds: 60 }))
  })
  afterEach(() => vi.useRealTimers())

  it('streams final/partial text and reports the final transcript exactly once', async () => {
    const s = newSession()
    const ws = await connected(s)
    s.sendPcm(loud())
    expect(ws.sent).toHaveLength(1) // one 100 ms AudioEvent
    ws.receive(transcriptEvent([result('a', 'chest', true)]))
    expect(onText).toHaveBeenLastCalledWith('chest', { final: '', partial: 'chest', language: '' })
    ws.receive(transcriptEvent([result('a', 'chest pain', false)]))

    s.stop()
    s.stop()
    expect(stopCapture).toHaveBeenCalledTimes(1)
    expect(codec.decode(ws.sent.at(-1)).body.length).toBe(0) // end-of-stream frame
    ws.serverClose(1000)
    await vi.advanceTimersByTimeAsync(20000) // the finalize timeout must not fire a second final

    expect(onFinal).toHaveBeenCalledTimes(1)
    expect(onFinal).toHaveBeenCalledWith('chest pain', { error: false, language: '' })
  })

  it('after Stop, the last final result ends finalizing early', async () => {
    const s = newSession()
    const ws = await connected(s)
    ws.receive(transcriptEvent([result('a', 'high fev', true)]))
    s.stop()
    expect(onFinal).not.toHaveBeenCalled()
    ws.receive(transcriptEvent([result('a', 'high fever', false)]))
    expect(onFinal).toHaveBeenCalledWith('high fever', { error: false, language: '' })
  })

  it(`finalizing gives up after ${VOICE_FINALIZE_MS} ms with what it has`, async () => {
    const s = newSession()
    const ws = await connected(s)
    ws.receive(transcriptEvent([result('a', 'head', true)]))
    s.stop()
    await vi.advanceTimersByTimeAsync(VOICE_FINALIZE_MS - 1)
    expect(onFinal).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(onFinal).toHaveBeenCalledWith('head', { error: false, language: '' })
  })

  it('an empty recording finishes with empty text', async () => {
    const s = newSession()
    const ws = await connected(s)
    s.stop()
    ws.serverClose(1000)
    expect(onFinal).toHaveBeenCalledWith('', { error: false, language: '' })
  })

  it('auto-stops after 3 s of silence and at the max duration', async () => {
    const quiet = newSession()
    await connected(quiet)
    await vi.advanceTimersByTimeAsync(3250)
    expect(quiet.state).toBe('processing')

    stopCapture.mockClear()
    const talker = newSession()
    await connected(talker)
    for (let t = 0; t < 59; t++) { talker.sendPcm(loud()); await vi.advanceTimersByTimeAsync(1000) }
    expect(talker.state).toBe('recording')
    talker.sendPcm(loud())
    await vi.advanceTimersByTimeAsync(1250)
    expect(talker.state).toBe('processing')
    expect(stopCapture).toHaveBeenCalledTimes(1)
  })

  it('re-requests the presigned URL once when the handshake is refused', async () => {
    const s = newSession()
    s.start()
    await vi.advanceTimersByTimeAsync(0)
    FakeWebSocket.instances[0].serverClose(1006) // e.g. expired signature
    await vi.advanceTimersByTimeAsync(0)
    expect(getSession).toHaveBeenCalledTimes(2)
    FakeWebSocket.instances[1].open()
    expect(s.state).toBe('recording')
    expect(onError).not.toHaveBeenCalled()
  })

  it('buffers audio while connecting and flushes on open', async () => {
    const s = newSession()
    s.start()
    s.sendPcm(loud())
    s.sendPcm(loud())
    await vi.advanceTimersByTimeAsync(0)
    const ws = FakeWebSocket.instances[0]
    expect(ws.sent).toHaveLength(0)
    ws.open()
    expect(ws.sent).toHaveLength(2)
  })

  it('reports a Transcribe exception and keeps the text so far', async () => {
    const s = newSession()
    const ws = await connected(s)
    ws.receive(transcriptEvent([result('a', 'head', true)]))
    ws.receive(exceptionEvent('LimitExceededException', 'too many streams'))
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'transcribe' }))
    expect(onFinal).toHaveBeenCalledWith('head', { error: true, language: '' })
  })

  it('reports a failed session request', async () => {
    getSession = vi.fn(async () => { throw new Error('Too many voice sessions.') })
    const s = newSession()
    s.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'session', message: 'Too many voice sessions.' }))
    expect(stopCapture).toHaveBeenCalledTimes(1)
    expect(onFinal).toHaveBeenCalledWith('', { error: true, language: '' })
  })

  it('cancel releases the mic and reports nothing; start after stop is a no-op', async () => {
    const s = newSession()
    await connected(s)
    s.cancel()
    expect(stopCapture).toHaveBeenCalledTimes(1)
    expect(onFinal).not.toHaveBeenCalled()

    const early = newSession()
    early.stop() // Stop pressed while the permission prompt was still open
    early.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(FakeWebSocket.instances).toHaveLength(1) // no new connection
  })
})
