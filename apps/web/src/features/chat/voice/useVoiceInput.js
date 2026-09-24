// Voice input for the chat composer: mic -> AudioWorklet -> 16 kHz PCM ->
// Amazon Transcribe, over a WebSocket presigned by POST /api/voice/session.
// The session logic (framing, transcript, timers, retries) is shared with
// mobile in @sankatai/shared/voice; this file owns the browser microphone and
// the React state only. Audio and transcripts are never stored or logged.
import { useCallback, useEffect, useRef, useState } from 'react'
import { createDownsampler, createVoiceSession, VOICE_DEFAULT_LANGUAGE, VOICE_LANGUAGES } from '@sankatai/shared/voice'
import { request } from '../../../services/api/httpClient'
import { applyVoiceFinal } from './voiceFinal'
import workletUrl from './pcm-worklet.js?url&no-inline' // a real file: Safari's addModule rejects data: URLs

const LANG_KEY = 'sankatai.voiceLang'

const getVoiceSession = (languageCode) => request('/voice/session', { method: 'POST', body: { languageCode } })

const savedLanguage = () => {
  try {
    const v = localStorage.getItem(LANG_KEY)
    return VOICE_LANGUAGES.some((l) => l.code === v) ? v : VOICE_DEFAULT_LANGUAGE
  } catch { return VOICE_DEFAULT_LANGUAGE }
}

const micErrorText = (e) => {
  if (e?.name === 'NotAllowedError' || e?.name === 'SecurityError') return 'Microphone access is blocked. Allow it for this site in your browser settings to use voice input.'
  if (e?.name === 'NotFoundError' || e?.name === 'OverconstrainedError') return 'No microphone was found.'
  if (e?.name === 'NotReadableError') return 'Your microphone is being used by another app.'
  return e?.message || 'Could not start the microphone.'
}

const sessionErrorText = (e) => {
  if (e?.code === 'session') return e.message
  if (e?.code === 'network') return `${e.message} Please try again.`
  return 'Voice input stopped unexpectedly. Please try again.'
}

// The AudioContext is created by the caller inside the click, so Safari lets
// it run. Resolves to a function that releases everything.
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
    return () => {
      node.port.onmessage = null
      source.disconnect()
      node.disconnect()
      stream.getTracks().forEach((t) => t.stop())
      ctx.close().catch(() => {})
    }
  } catch (e) {
    stream.getTracks().forEach((t) => t.stop())
    throw e
  }
}

// state: 'idle' | 'recording' | 'processing'
export function useVoiceInput({ input, setInput, onSend, onError }) {
  const [state, setState] = useState('idle')
  const [language, setLanguageState] = useState(savedLanguage)
  const sessionRef = useRef(null)
  const startingRef = useRef(null) // the session waiting on the mic permission prompt
  // Latest callbacks, so a recording that outlives a render sends through the
  // current handleSend (not the one captured when it started).
  const latest = useRef({ input, setInput, onSend, onError })
  useEffect(() => { latest.current = { input, setInput, onSend, onError } })
  useEffect(() => {
    const ref = sessionRef
    return () => { ref.current?.cancel(); ref.current = null }
  }, [])

  const setLanguage = useCallback((code) => {
    setLanguageState(code)
    try { localStorage.setItem(LANG_KEY, code) } catch { /* storage unavailable */ }
  }, [])

  const toggle = useCallback(async () => {
    const current = sessionRef.current
    if (current) {
      // A second tap while the permission prompt is open cancels; otherwise it stops.
      if (startingRef.current === current) { current.cancel(); sessionRef.current = null; startingRef.current = null; setState('idle') }
      else current.stop()
      return
    }
    if (!navigator.mediaDevices?.getUserMedia || typeof AudioWorkletNode === 'undefined') {
      latest.current.onError('Voice input is not supported in this browser.')
      return
    }

    const base = latest.current.input.trim()
    let stopMic = null
    const session = createVoiceSession({
      getSession: getVoiceSession,
      languageCode: language,
      onState: setState,
      onText: (t) => latest.current.setInput([base, t].filter(Boolean).join(' ')),
      onError: (e) => latest.current.onError(sessionErrorText(e)),
      stopCapture: () => stopMic?.(),
      onFinal: (transcript, { error }) => {
        sessionRef.current = null
        applyVoiceFinal({ base, transcript, error, setInput: latest.current.setInput, send: latest.current.onSend })
      },
    })
    sessionRef.current = session
    startingRef.current = session
    session.prepare() // fetch the presigned URL while the permission prompt is open

    const ctx = new AudioContext()
    try {
      stopMic = await openMic(ctx, (pcm) => session.sendPcm(pcm))
    } catch (e) {
      ctx.close().catch(() => {})
      if (sessionRef.current === session) {
        session.cancel()
        sessionRef.current = null
        latest.current.onError(micErrorText(e))
      }
      if (startingRef.current === session) startingRef.current = null
      return
    }
    if (startingRef.current === session) startingRef.current = null
    if (sessionRef.current !== session) { stopMic(); return } // cancelled meanwhile
    session.start()
  }, [language])

  return { state, toggle, language, setLanguage }
}
