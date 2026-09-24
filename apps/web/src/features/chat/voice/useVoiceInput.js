// Voice input for the chat composer: mic -> AudioWorklet -> 16 kHz PCM ->
// Amazon Transcribe, over a WebSocket presigned by POST /api/voice/session.
// The session logic (framing, transcript, timers, retries) and the state
// machine are shared with mobile in @sankatai/shared/voice; this file owns the
// browser microphone and the React state only. Audio and transcripts are never
// stored or logged.
//
// idle ──open──> recording ──stop──> finalizing ──last final/1.5 s──> review
// The transcript is written into the SAME input state used for typing and is
// never sent automatically: the user reviews/edits it and presses Send.
// Transcribe identifies the language (no selector); the latest recording's
// language is kept with the draft (`draftLang`) and sent with the message.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createDownsampler, createVoiceSession, joinVoiceText, nextVoiceState } from '@sankatai/shared/voice'
import { request } from '../../../services/api/httpClient'
import { ttsPlayer } from '../tts/ttsPlayer'
import workletUrl from './pcm-worklet.js?url&no-inline' // a real file: Safari's addModule rejects data: URLs

const EMPTY_PREVIEW = { final: '', partial: '', language: '' }

const getVoiceSession = () => request('/voice/session', { method: 'POST' })

// { message, hint } shown inside the popup; hint is set when a browser setting can fix it.
const micError = (e) => {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') {
    return { message: 'Microphone access is blocked.', hint: 'Open your browser’s site settings (the icon left of the address bar), set Microphone to Allow, then try again.' }
  }
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return { message: 'No microphone was found.', hint: 'Connect a microphone and try again.' }
  if (e?.name === 'NotReadableError') return { message: 'Your microphone is being used by another app.', hint: '' }
  return { message: e?.message || 'Could not start the microphone.', hint: '' }
}

const sessionErrorText = (e) => {
  if (e?.code === 'session') return e.message
  if (e?.code === 'network') return `${e.message} Please try again.`
  return 'Voice input stopped unexpectedly. Please try again.'
}

// The AudioContext is created by the caller inside the click, so Safari lets
// it run. Resolves to { ctx, source, stop } — `source` is shared with the
// popup's level meter, so the microphone is opened exactly once.
async function openMic(ctx, onPcm) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true },
  })
  try {
    await ctx.audioWorklet.addModule(workletUrl)
    if (ctx.state === 'suspended') await ctx.resume()
    const source = ctx.createMediaStreamSource(stream)
    const node = new AudioWorkletNode(ctx, 'pcm-capture')
    const downsample = createDownsampler(ctx.sampleRate)
    node.port.onmessage = (e) => onPcm(downsample(e.data))
    source.connect(node)
    node.connect(ctx.destination) // keeps the graph pulling; the node outputs silence
    const stop = () => {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      ctx.close().catch(() => {})
    }
    return { ctx, source, stop }
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop())
    throw e
  }
}

// state: 'idle' | 'recording' | 'finalizing' | 'review'
export function useVoiceInput({ input, setInput, onError }) {
  const [state, setState] = useState('idle')
  const [draftLang, setDraftLang] = useState(null) // detected language of the dictated draft
  const [mic, setMic] = useState(null) // { ctx, source } while the mic is live
  const [preview, setPreview] = useState(EMPTY_PREVIEW)
  const [error, setError] = useState(null) // { message, hint } — shown in the popup
  const sessionRef = useRef(null)
  const baseRef = useRef('') // input text from before this recording
  // Latest callbacks, so a recording that outlives a render uses current setters.
  const latest = useRef({ input, setInput, onError })
  useEffect(() => { latest.current = { input, setInput, onError } })
  useEffect(() => {
    const ref = sessionRef
    return () => { ref.current?.cancel(); ref.current = null }
  }, [])

  // Clearing the box during review returns to idle (and forgets the draft's language).
  if (state === 'review' && !input.trim()) { setState('idle'); setDraftLang(null) }

  // Never read a reply aloud while the microphone is open.
  const popupOpen = state === 'recording' || state === 'finalizing'
  useEffect(() => { ttsPlayer.setBlocked(popupOpen) }, [popupOpen])

  const open = useCallback(async () => {
    if (sessionRef.current) return
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      latest.current.onError('Voice input is not supported in this browser.')
      return
    }
    ttsPlayer.setBlocked(true) // stops any reply being read, before the mic opens
    const base = latest.current.input.trim()
    baseRef.current = base
    setError(null)
    setPreview(EMPTY_PREVIEW)
    setState((s) => nextVoiceState(s, 'mic'))

    let live = null
    // Every callback checks it still belongs to the current session, so late
    // Transcribe events can never overwrite what the user edits in review.
    const current = () => sessionRef.current === session
    const session = createVoiceSession({
      getSession: getVoiceSession,
      onState: (s) => { if (current() && s === 'processing') setState((st) => nextVoiceState(st, 'stop')) },
      onText: (text, split) => {
        if (!current()) return
        latest.current.setInput(joinVoiceText(base, text))
        setPreview(split)
      },
      onError: (e) => { if (current()) latest.current.onError(sessionErrorText(e)) },
      stopCapture: () => { live?.stop(); setMic(null) },
      onFinal: (transcript, { language }) => {
        if (!current()) return
        sessionRef.current = null
        if (transcript && language) setDraftLang(language)
        const text = joinVoiceText(base, transcript)
        latest.current.setInput(text)
        setPreview(EMPTY_PREVIEW)
        setState((st) => nextVoiceState(st, 'final', { text }))
      },
    })
    sessionRef.current = session
    session.prepare() // fetch the presigned URL while the permission prompt is open

    const ctx = new AudioContext()
    try {
      live = await openMic(ctx, (pcm) => session.sendPcm(pcm))
    } catch (e) {
      ctx.close().catch(() => {})
      if (current()) {
        session.cancel()
        setError(micError(e)) // popup stays open in its error state until Cancel
      }
      return
    }
    // Cancelled or stopped while the permission prompt was open.
    if (!current() || session.state !== 'recording') { live.stop(); return }
    setMic({ ctx: live.ctx, source: live.source })
    session.start()
  }, [])

  const stop = useCallback(() => {
    if (!sessionRef.current) return
    setState((s) => nextVoiceState(s, 'stop'))
    sessionRef.current.stop()
  }, [])

  // Discards this recording; text typed or dictated before it is kept.
  const cancel = useCallback(() => {
    const session = sessionRef.current
    sessionRef.current = null
    session?.cancel()
    setMic(null)
    setError(null)
    setPreview(EMPTY_PREVIEW)
    const base = baseRef.current
    latest.current.setInput(base)
    setState((s) => nextVoiceState(s, 'cancel', { text: base }))
  }, [])

  return { state, open, stop, cancel, draftLang, mic, preview, error }
}
