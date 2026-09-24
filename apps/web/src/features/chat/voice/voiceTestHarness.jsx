// Test-only: fakes for the browser audio/WebSocket APIs plus a harness that
// wires useVoiceInput + Composer exactly like useDashboard does.
/* eslint-disable react-refresh/only-export-components -- test module, never hot-reloaded */
import { useState } from 'react'
import { vi } from 'vitest'
import { EventStreamCodec } from '@smithy/eventstream-codec'
import Composer from '../components/Composer.jsx'
import { useVoiceInput } from './useVoiceInput'

const codec = new EventStreamCodec((b) => new TextDecoder().decode(b), (s) => new TextEncoder().encode(s))
const str = (value) => ({ type: 'string', value })
export const transcriptEvent = (results) => codec.encode({
  headers: { ':message-type': str('event'), ':event-type': str('TranscriptEvent'), ':content-type': str('application/json') },
  body: new TextEncoder().encode(JSON.stringify({ Transcript: { Results: results } })),
})
export const result = (id, text, partial, lang) => ({
  ResultId: id, IsPartial: partial, Alternatives: [{ Transcript: text }],
  ...(lang && { LanguageCode: lang, LanguageIdentification: [{ LanguageCode: lang, Score: 0.99 }] }),
})

export class FakeWebSocket {
  static instances = []
  constructor(url) { this.url = url; this.sent = []; FakeWebSocket.instances.push(this) }
  send(data) { this.sent.push(data) }
  close() { this.closed = true }
  open() { this.onopen?.() }
  receive(bytes) { this.onmessage?.({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) }) }
  serverClose(code = 1000) { this.onclose?.({ code }) }
}

// One fake microphone: records every node so tests can assert cleanup.
export function installAudioFakes({ reducedMotion = false } = {}) {
  const audio = { amp: 0, contexts: [], nodes: [], analysers: [], sources: [], tracks: [] }
  audio.getUserMedia = vi.fn(async () => {
    const track = { stop: vi.fn() }
    audio.tracks.push(track)
    return { getTracks: () => [track] }
  })
  class FakeAudioContext {
    constructor() {
      this.sampleRate = 48000
      this.state = 'running'
      this.destination = {}
      this.audioWorklet = { addModule: vi.fn(async () => {}) }
      this.close = vi.fn(async () => {})
      audio.contexts.push(this)
    }
    createMediaStreamSource() {
      const source = { connect: vi.fn(), disconnect: vi.fn() }
      audio.sources.push(source)
      return source
    }
    createAnalyser() {
      const analyser = { fftSize: 0, getFloatTimeDomainData: (buf) => buf.fill(audio.amp), disconnect: vi.fn() }
      audio.analysers.push(analyser)
      return analyser
    }
  }
  class FakeWorkletNode {
    constructor() { this.port = { onmessage: null }; this.disconnect = vi.fn(); audio.nodes.push(this) }
    connect() {}
  }
  vi.stubGlobal('AudioContext', FakeAudioContext)
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode)
  vi.stubGlobal('WebSocket', FakeWebSocket)
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia: audio.getUserMedia } })
  window.matchMedia = (q) => ({
    matches: reducedMotion && q.includes('reduce'), media: q,
    addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {},
  })
  FakeWebSocket.instances = []
  // Feeds 100 ms of audio through the worklet at the current amplitude.
  audio.speak = () => audio.nodes.at(-1)?.port.onmessage?.({ data: new Float32Array(4800).fill(audio.amp) })
  return audio
}

export function Harness({ send, onError = () => {} }) {
  const [input, setInput] = useState('')
  const voice = useVoiceInput({ input, setInput, onError })
  // Same contract as useDashboard.handleSend: read the input, send with the
  // voice meta (dictated drafts carry the detected language), clear.
  const onSubmit = (e) => {
    e?.preventDefault()
    const meta = voice.state === 'review' ? { inputMode: 'voice', lang: voice.draftLang || undefined } : { inputMode: 'text' }
    send(input.trim(), meta)
    setInput('')
  }
  return (
    <Composer
      input={input} setInput={setInput} onSubmit={onSubmit} isLoading={false} voice={voice}
      attachments={[]} onRemoveAttachment={() => {}} docInputRef={{ current: null }} photoInputRef={{ current: null }}
    />
  )
}
