// Voice input on mobile: native mic (16 kHz mono PCM via @siteed/audio-studio)
// -> Amazon Transcribe over a WebSocket presigned by POST /api/voice/session.
// Framing, transcript, timers and retries are shared with the web app
// (packages/shared/voice.js); this owns the native mic and React state only.
// Audio is streamed, never written to a file, stored or logged.
//
// Needs a development build: Expo Go has no audio-stream native module, so
// voice reports itself unavailable there and the rest of the app is unaffected.
import { useCallback, useEffect, useRef, useState } from 'react'
import { request } from './api'
import { createDownsampler, createVoiceSession, voiceResult, VOICE_DEFAULT_LANGUAGE, VOICE_SAMPLE_RATE } from '../../../../packages/shared/voice'

let studio = null
try {
  studio = require('@siteed/audio-studio')
} catch {
  studio = null // Expo Go: native module missing
}
const noRecorder = () => null
const useRecorder = studio ? studio.useAudioRecorder : noRecorder

// EXPO_PUBLIC_VOICE_AUTO_SEND=false leaves the transcript in the box for editing.
const AUTO_SEND = process.env.EXPO_PUBLIC_VOICE_AUTO_SEND !== 'false'

const getVoiceSession = (languageCode) => request('/voice/session', { method: 'POST', body: { languageCode } })

// Native chunks arrive as base64 little-endian PCM16.
const base64ToInt16 = (b64) => {
  const bin = atob(b64)
  const bytes = new Uint8Array(bin.length & ~1)
  for (let i = 0; i < bytes.length; i++) bytes[i] = bin.charCodeAt(i)
  return new Int16Array(bytes.buffer)
}

const sessionErrorText = (e) => {
  if (e?.code === 'session') return e.message
  if (e?.code === 'network') return `${e.message} Please try again.`
  return 'Voice input stopped unexpectedly. Please try again.'
}

// state: 'idle' | 'recording' | 'processing'
export function useVoiceInput({ input, setInput, onSend, onError }) {
  const recorder = useRecorder()
  const [state, setState] = useState('idle')
  const [language, setLanguage] = useState(VOICE_DEFAULT_LANGUAGE)
  const sessionRef = useRef(null)
  const startingRef = useRef(null) // the session waiting on the permission prompt
  // Latest callbacks, so a recording that outlives a render sends through the
  // current send() (not the one captured when it started).
  const latest = useRef({ input, setInput, onSend, onError, recorder })
  useEffect(() => { latest.current = { input, setInput, onSend, onError, recorder } })
  useEffect(() => {
    const ref = sessionRef
    return () => { ref.current?.cancel(); ref.current = null }
  }, [])

  const toggle = useCallback(async () => {
    const current = sessionRef.current
    if (current) {
      // A second tap during the permission prompt cancels; otherwise it stops.
      if (startingRef.current === current) { current.cancel(); sessionRef.current = null; startingRef.current = null; setState('idle') }
      else current.stop()
      return
    }
    if (!latest.current.recorder) {
      latest.current.onError('Voice input needs the full app build. It is not available in Expo Go.')
      return
    }

    const base = latest.current.input.trim()
    const session = createVoiceSession({
      getSession: getVoiceSession,
      languageCode: language,
      onState: setState,
      onText: (t) => latest.current.setInput([base, t].filter(Boolean).join(' ')),
      onError: (e) => latest.current.onError(sessionErrorText(e)),
      stopCapture: () => { latest.current.recorder?.stopRecording().catch(() => {}) },
      onFinal: (transcript, { error }) => {
        sessionRef.current = null
        const r = voiceResult(base, transcript, { autoSend: AUTO_SEND, error })
        latest.current.setInput(r.text)
        if (r.send) latest.current.onSend(r.text)
      },
    })
    sessionRef.current = session
    startingRef.current = session
    session.prepare() // fetch the presigned URL while the permission prompt is open

    const toPcm16 = createDownsampler(VOICE_SAMPLE_RATE) // only if a build delivers float32
    try {
      const perm = await studio.AudioStudioModule.requestPermissionsAsync()
      if (perm?.status !== 'granted') throw Object.assign(new Error('permission'), { code: 'permission' })
      if (sessionRef.current !== session) return // cancelled during the prompt
      await latest.current.recorder.startRecording({
        sampleRate: VOICE_SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 100,
        output: { primary: { enabled: false } }, // stream only: no file on the device
        keepAwake: false,
        showNotification: false,
        onAudioStream: async (e) => {
          session.sendPcm(typeof e.data === 'string' ? base64ToInt16(e.data) : toPcm16(e.data))
        },
      })
    } catch (e) {
      if (sessionRef.current === session) {
        session.cancel()
        sessionRef.current = null
        latest.current.onError(e?.code === 'permission'
          ? 'Microphone access is off. Turn it on for Sankat.AI in your phone settings to use voice input.'
          : 'Could not start the microphone.')
      }
      if (startingRef.current === session) startingRef.current = null
      return
    }
    if (startingRef.current === session) startingRef.current = null
    if (sessionRef.current !== session) { latest.current.recorder.stopRecording().catch(() => {}); return }
    session.start()
  }, [language])

  return { state, toggle, language, setLanguage, available: Boolean(recorder) }
}
