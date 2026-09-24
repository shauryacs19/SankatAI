import { crc32 } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EventStreamCodec } from '@smithy/eventstream-codec'
import {
  createDownsampler, createTranscript, createVoiceSession, decodeTranscribeMessage, encodeAudioEvent, voiceResult,
} from '@sankatai/shared/voice'
import { applyVoiceFinal } from './voiceFinal'

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

describe('transcript + final decision', () => {
  it('replaces partials and accumulates finals', () => {
    const t = createTranscript()
    t.apply([result('a', 'chest', true)])
    t.apply([result('a', 'chest pain', true)])
    expect(t.text).toBe('chest pain')
    t.apply([result('a', 'Chest pain.', false), result('b', 'since', true)])
    expect(t.text).toBe('Chest pain. since')
  })

  it('never sends an empty transcript, an errored session, or with auto-send off', () => {
    expect(voiceResult('', '   ')).toEqual({ text: '', send: false })
    expect(voiceResult('typed', '')).toEqual({ text: 'typed', send: false })
    expect(voiceResult('', 'fever', { error: true }).send).toBe(false)
    expect(voiceResult('', 'fever', { autoSend: false })).toEqual({ text: 'fever', send: false })
    expect(voiceResult('I have', ' fever ')).toEqual({ text: 'I have fever', send: true })
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

describe('voice session → chat send', () => {
  let send, setInput, getSession, stopCapture, onError

  // Wired exactly like useVoiceInput: onFinal -> applyVoiceFinal -> send.
  const newSession = (extra = {}) => createVoiceSession({
    getSession, WebSocketImpl: FakeWebSocket, stopCapture, onError,
    onFinal: (transcript, { error }) => applyVoiceFinal({ base: '', transcript, error, autoSend: true, setInput, send }),
    ...extra,
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
    send = vi.fn()
    setInput = vi.fn()
    stopCapture = vi.fn()
    onError = vi.fn()
    getSession = vi.fn(async () => ({ url: 'wss://example/stream', expiresIn: 60, maxSeconds: 60 }))
  })
  afterEach(() => vi.useRealTimers())

  it('sends the final transcript exactly once', async () => {
    const s = newSession()
    const ws = await connected(s)
    s.sendPcm(loud())
    expect(ws.sent).toHaveLength(1) // one 100 ms AudioEvent
    ws.receive(transcriptEvent([result('a', 'chest', true)]))
    ws.receive(transcriptEvent([result('a', 'chest pain', false)]))

    s.stop()
    s.stop()
    expect(stopCapture).toHaveBeenCalledTimes(1)
    expect(codec.decode(ws.sent.at(-1)).body.length).toBe(0) // end-of-stream frame
    ws.serverClose(1000)
    await vi.advanceTimersByTimeAsync(20000) // the end timeout must not fire a second final

    expect(send).toHaveBeenCalledTimes(1)
    expect(send).toHaveBeenCalledWith('chest pain')
  })

  it('does not send an empty transcript', async () => {
    const s = newSession()
    const ws = await connected(s)
    s.stop()
    ws.serverClose(1000)
    expect(send).not.toHaveBeenCalled()
    expect(setInput).toHaveBeenCalledWith('')
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

  it('reports a Transcribe exception and leaves the text unsent', async () => {
    const s = newSession()
    const ws = await connected(s)
    ws.receive(transcriptEvent([result('a', 'head', true)]))
    ws.receive(exceptionEvent('LimitExceededException', 'too many streams'))
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'transcribe' }))
    expect(setInput).toHaveBeenLastCalledWith('head')
    expect(send).not.toHaveBeenCalled()
  })

  it('reports a failed session request', async () => {
    getSession = vi.fn(async () => { throw new Error('Too many voice sessions.') })
    const s = newSession()
    s.start()
    await vi.advanceTimersByTimeAsync(0)
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ code: 'session', message: 'Too many voice sessions.' }))
    expect(stopCapture).toHaveBeenCalledTimes(1)
    expect(send).not.toHaveBeenCalled()
  })

  it('cancel releases the mic and reports nothing', async () => {
    const onFinal = vi.fn()
    const s = newSession({ onFinal })
    await connected(s)
    s.cancel()
    expect(stopCapture).toHaveBeenCalledTimes(1)
    expect(onFinal).not.toHaveBeenCalled()
  })
})
