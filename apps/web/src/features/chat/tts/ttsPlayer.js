// Read-aloud player for assistant replies. One module-level controller so only
// one reply plays at a time across the app: starting another stops the current
// one. It refuses to play while the microphone is open (`setBlocked`) and is
// stopped on navigation. Audio comes from POST /api/tts as a blob; its object
// URL is revoked as soon as playback ends or stops.
import { useSyncExternalStore } from 'react'

const IDLE = { id: null, status: 'idle' } // status: idle | loading | playing | paused

let state = IDLE
let audio = null
let url = null
let blocked = false
let seq = 0 // bumps on every stop, so a superseded load never starts playing
const listeners = new Set()

const set = (next) => {
  state = next
  listeners.forEach((l) => l())
}

function release() {
  if (audio) {
    audio.onended = audio.onerror = null
    audio.pause()
    audio.removeAttribute('src')
  }
  if (url) URL.revokeObjectURL(url)
  audio = null
  url = null
}

export const ttsPlayer = {
  subscribe(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
  },
  getState: () => state,

  // load: () => Promise<Blob>. Resolves true once playing, false if blocked or
  // superseded. Rejects on load/play failure (e.g. autoplay not allowed).
  async play(id, load) {
    if (blocked) return false
    if (state.id === id && state.status === 'paused' && audio) {
      await audio.play()
      set({ id, status: 'playing' })
      return true
    }
    ttsPlayer.stop()
    const mine = seq
    set({ id, status: 'loading' })
    try {
      const blob = await load()
      if (mine !== seq || blocked) return false
      url = URL.createObjectURL(blob)
      audio = new Audio(url)
      audio.onended = () => { if (mine === seq) ttsPlayer.stop() }
      audio.onerror = () => { if (mine === seq) ttsPlayer.stop() }
      await audio.play()
      if (mine !== seq) return false
      set({ id, status: 'playing' })
      return true
    } catch (e) {
      if (mine === seq) ttsPlayer.stop()
      throw e
    }
  },

  pause() {
    if (audio && state.status === 'playing') {
      audio.pause()
      set({ ...state, status: 'paused' })
    }
  },

  stop() {
    seq += 1
    release()
    if (state !== IDLE) set(IDLE)
  },

  // True while the mic is open: stops playback and refuses new playback.
  setBlocked(value) {
    blocked = Boolean(value)
    if (blocked) ttsPlayer.stop()
  },
}

export const useTtsState = () => useSyncExternalStore(ttsPlayer.subscribe, ttsPlayer.getState)
