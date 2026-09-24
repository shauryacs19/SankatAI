// Voice input on mobile: native mic (16 kHz mono PCM via @siteed/audio-studio)
// -> Amazon Transcribe over a WebSocket presigned by POST /api/voice/session.
// Framing, transcript, timers, retries and the state machine are shared with
// the web app (packages/shared/voice.js); this owns the native mic and React
// state only. Audio is streamed, never written to a file, stored or logged.
//
// idle ──open──> recording ──stop──> finalizing ──last final/1.5 s──> review
// The transcript goes into the chat input for review; it is never sent here.
// Transcribe identifies the language (no selector); the latest recording's
// language is kept with the draft (`draftLang`) and sent with the message.
//
// Needs a development build: Expo Go has no audio-stream native module, so
// voice reports itself unavailable there and the rest of the app is unaffected.
import { useCallback, useEffect, useRef, useState } from 'react'
import { Animated } from 'react-native'
import { request } from './api'
import { tts } from './tts'
import {
  createDownsampler, createLevelMeter, createVoiceSession, joinVoiceText, nextVoiceState, pcmRms, VOICE_SAMPLE_RATE,
} from '../../../../packages/shared/voice'

let studio = null
try {
  studio = require('@siteed/audio-studio')
} catch {
  studio = null // Expo Go: native module missing
}
let Haptics = null
try {
  Haptics = require('expo-haptics')
} catch {
  Haptics = null // older dev build without the module: no haptics, nothing else changes
}
const noRecorder = () => null
const useRecorder = studio ? studio.useAudioRecorder : noRecorder
const tap = () => { Haptics?.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}) }

const EMPTY_PREVIEW = { final: '', partial: '', language: '' }

const getVoiceSession = () => request('/voice/session', { method: 'POST' })

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

// state: 'idle' | 'recording' | 'finalizing' | 'review'
export function useVoiceInput({ input, setInput, onError }) {
  const recorder = useRecorder()
  const [state, setState] = useState('idle')
  const [draftLang, setDraftLang] = useState(null) // detected language of the dictated draft
  const [preview, setPreview] = useState(EMPTY_PREVIEW)
  const [error, setError] = useState(null) // { message, hint, settings } — shown in the sheet
  const [live, setLive] = useState(false) // mic streaming
  const [speaking, setSpeaking] = useState(false)
  const level = useRef(new Animated.Value(0)).current // 0..1, drives mic scale + ripple size
  const sessionRef = useRef(null)
  const baseRef = useRef('')
  // Latest callbacks, so a recording that outlives a render uses current setters.
  const latest = useRef({ input, setInput, onError, recorder })
  useEffect(() => { latest.current = { input, setInput, onError, recorder } })
  useEffect(() => {
    const ref = sessionRef
    return () => { ref.current?.cancel(); ref.current = null }
  }, [])

  // Clearing the box during review returns to idle (and forgets the draft's language).
  if (state === 'review' && !input.trim()) { setState('idle'); setDraftLang(null) }

  // Never read a reply aloud while the microphone is open.
  const sheetOpen = state === 'recording' || state === 'finalizing'
  useEffect(() => { tts.setBlocked(sheetOpen) }, [sheetOpen])

  const resetLevel = () => { setSpeaking(false); level.setValue(0) }

  const open = useCallback(async () => {
    if (sessionRef.current) return
    tap()
    tts.setBlocked(true) // stops any reply being read, before the mic opens
    const base = latest.current.input.trim()
    baseRef.current = base
    setError(null)
    setPreview(EMPTY_PREVIEW)
    setState((s) => nextVoiceState(s, 'mic'))
    if (!latest.current.recorder) {
      setError({ message: 'Voice input needs the full app build.', hint: 'It is not available in Expo Go.' })
      return
    }

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
      stopCapture: () => {
        latest.current.recorder?.stopRecording().catch(() => {})
        setLive(false)
        resetLevel()
      },
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

    // Ripple level from the same PCM that goes to Transcribe — no second mic.
    const meter = createLevelMeter()
    let wasSpeaking = false
    const onPcm = (pcm) => {
      session.sendPcm(pcm)
      const { level: l, speaking: s } = meter.update(pcmRms(pcm), Date.now())
      Animated.timing(level, { toValue: Math.min(1, l * 8), duration: 100, useNativeDriver: true }).start()
      if (s !== wasSpeaking) { wasSpeaking = s; setSpeaking(s) }
    }
    const toPcm16 = createDownsampler(VOICE_SAMPLE_RATE) // only if a build delivers float32

    try {
      const perm = await studio.AudioStudioModule.requestPermissionsAsync()
      if (perm?.status !== 'granted') throw Object.assign(new Error('permission'), { code: 'permission' })
      if (!current()) return // cancelled during the prompt
      await latest.current.recorder.startRecording({
        sampleRate: VOICE_SAMPLE_RATE,
        channels: 1,
        encoding: 'pcm_16bit',
        interval: 100,
        output: { primary: { enabled: false } }, // stream only: no file on the device
        keepAwake: false,
        showNotification: false,
        onAudioStream: async (e) => onPcm(typeof e.data === 'string' ? base64ToInt16(e.data) : toPcm16(e.data)),
      })
    } catch (e) {
      if (current()) {
        session.cancel()
        setError(e?.code === 'permission'
          ? { message: 'Microphone access is off.', hint: 'Turn on Microphone for Sankat.AI in Settings, then try again.', settings: true }
          : { message: 'Could not start the microphone.', hint: '' })
      }
      return
    }
    // Cancelled or stopped while the permission prompt was open.
    if (!current() || session.state !== 'recording') { latest.current.recorder.stopRecording().catch(() => {}); return }
    setLive(true)
    session.start()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const stop = useCallback(() => {
    if (!sessionRef.current) return
    tap()
    setState((s) => nextVoiceState(s, 'stop'))
    sessionRef.current.stop()
  }, [])

  // Discards this recording; text typed or dictated before it is kept.
  const cancel = useCallback(() => {
    const session = sessionRef.current
    sessionRef.current = null
    session?.cancel()
    setLive(false)
    resetLevel()
    setError(null)
    setPreview(EMPTY_PREVIEW)
    const base = baseRef.current
    latest.current.setInput(base)
    setState((s) => nextVoiceState(s, 'cancel', { text: base }))
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  return { state, open, stop, cancel, draftLang, preview, error, live, speaking, level }
}
