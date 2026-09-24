// Read-aloud player for assistant replies (native audio via expo-audio). One
// module-level controller: only one reply plays at a time, it refuses to play
// while the microphone is open (`setBlocked`), and screens stop it when they
// lose focus. MP3 comes from POST /api/tts (text + language are looked up
// server-side) and is written to a temp file that is deleted when playback
// ends or stops.
import { useSyncExternalStore } from 'react'
import * as FileSystem from 'expo-file-system/legacy'
import * as SecureStore from 'expo-secure-store'
import { request } from './api'

let audio = null
try {
  audio = require('expo-audio')
} catch {
  audio = null // a dev build made before expo-audio was added: no read-aloud
}
export const ttsAvailable = Boolean(audio?.createAudioPlayer)

const IDLE = { id: null, status: 'idle' } // status: idle | loading | playing | paused
let state = IDLE
let player = null
let sub = null
let file = null
let blocked = false
let seq = 0
let modeSet = false
const listeners = new Set()
const set = (next) => { state = next; listeners.forEach((l) => l()) }

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(reader.error || new Error('Could not read the audio.'))
  reader.readAsDataURL(blob)
})

// Downloads the reply's MP3 to a temp file; resolves to its uri.
export async function loadTts(consultationId, messageId) {
  const blob = await request('/tts', { method: 'POST', body: { consultationId, messageId }, responseType: 'blob' }, 30000)
  const uri = `${FileSystem.cacheDirectory}tts-${messageId}-${Date.now()}.mp3`
  await FileSystem.writeAsStringAsync(uri, await blobToBase64(blob), { encoding: FileSystem.EncodingType.Base64 })
  return uri
}

function release() {
  sub?.remove()
  if (player) {
    try { player.pause(); player.remove() } catch { /* already released */ }
  }
  if (file) FileSystem.deleteAsync(file, { idempotent: true }).catch(() => {})
  player = null
  sub = null
  file = null
}

export const tts = {
  subscribe(l) { listeners.add(l); return () => listeners.delete(l) },
  getState: () => state,

  // load: () => Promise<fileUri>. Resolves true once playing, false if blocked/superseded.
  async play(id, load) {
    if (!ttsAvailable || blocked) return false
    if (state.id === id && state.status === 'paused' && player) {
      player.play()
      set({ id, status: 'playing' })
      return true
    }
    tts.stop()
    const mine = seq
    set({ id, status: 'loading' })
    try {
      if (!modeSet) { await audio.setAudioModeAsync({ playsInSilentMode: true }); modeSet = true }
      const uri = await load()
      if (mine !== seq || blocked) { FileSystem.deleteAsync(uri, { idempotent: true }).catch(() => {}); return false }
      file = uri
      player = audio.createAudioPlayer({ uri })
      sub = player.addListener('playbackStatusUpdate', (s) => { if (s.didJustFinish && mine === seq) tts.stop() })
      player.play()
      set({ id, status: 'playing' })
      return true
    } catch (e) {
      if (mine === seq) tts.stop()
      throw e
    }
  },

  pause() {
    if (player && state.status === 'playing') { player.pause(); set({ ...state, status: 'paused' }) }
  },

  stop() {
    seq += 1
    release()
    if (state !== IDLE) set(IDLE)
  },

  setBlocked(value) {
    blocked = Boolean(value)
    if (blocked) tts.stop()
  },
}

export const useTtsState = () => useSyncExternalStore(tts.subscribe, tts.getState)

// "Auto-read replies to voice messages" (default off), stored like the theme.
const AUTO_READ_KEY = 'sankatai_autoread'
export const getAutoRead = async () => {
  try { return (await SecureStore.getItemAsync(AUTO_READ_KEY)) === 'true' } catch { return false }
}
export const setAutoRead = async (on) => {
  try { await SecureStore.setItemAsync(AUTO_READ_KEY, on ? 'true' : 'false') } catch { /* non-fatal */ }
}
