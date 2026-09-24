// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { FakeWebSocket, Harness, installAudioFakes, result, transcriptEvent } from './voiceTestHarness.jsx'
import { ttsPlayer } from '../tts/ttsPlayer'

vi.mock('../../../services/api/httpClient', () => ({
  request: vi.fn(async () => ({ url: 'wss://transcribe.test/stream', expiresIn: 60, languageOptions: ['en-IN', 'hi-IN'], preferredLanguage: 'en-IN', sampleRate: 16000, maxSeconds: 60 })),
}))

let audio
let send
const input = () => screen.getByLabelText('Describe your symptoms', { selector: 'input' })
const sendButton = () => screen.getByRole('button', { name: /send message|waiting/i })
const dialog = () => screen.queryByRole('dialog')

// Mic pressed -> popup open, mic live, socket connected.
async function startRecording() {
  fireEvent.click(screen.getByRole('button', { name: /voice input|record more/i }))
  await waitFor(() => expect(FakeWebSocket.instances.length).toBeGreaterThan(0))
  const ws = FakeWebSocket.instances.at(-1)
  act(() => ws.open())
  await waitFor(() => expect(screen.getByRole('button', { name: 'Stop' }).disabled).toBe(false))
  return ws
}

async function stopWithFinal(ws, text, lang) {
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
  act(() => ws.receive(transcriptEvent([result('r', text, false, lang)])))
  await waitFor(() => expect(dialog()).toBeNull())
}

beforeEach(() => {
  audio = installAudioFakes()
  send = vi.fn()
})
afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

describe('listening popup -> review -> send', () => {
  it('Stop never sends: the popup closes and the text lands in an editable, focused input', async () => {
    render(<Harness send={send} />)
    const ws = await startRecording()

    expect(dialog()).not.toBeNull()
    expect(input().readOnly).toBe(true)
    expect(sendButton().disabled).toBe(true) // recording

    act(() => ws.receive(transcriptEvent([result('r', 'chest', true)])))
    expect(input().value).toBe('chest')
    expect(dialog().querySelector('.vp-partial').textContent).toBe('chest')

    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(screen.getByText('Processing…')).toBeTruthy()
    expect(sendButton().disabled).toBe(true) // finalizing
    act(() => ws.receive(transcriptEvent([result('r', 'chest pain', false)])))
    await waitFor(() => expect(dialog()).toBeNull())

    expect(send).not.toHaveBeenCalled()
    expect(input().value).toBe('chest pain')
    expect(input().readOnly).toBe(false)
    expect(document.activeElement).toBe(input())
    expect(input().selectionStart).toBe('chest pain'.length)
    expect(sendButton().disabled).toBe(false)
  })

  it('sends the edited text through the normal send; clearing disables Send', async () => {
    render(<Harness send={send} />)
    await stopWithFinal(await startRecording(), 'chest pain')

    fireEvent.change(input(), { target: { value: '' } })
    expect(sendButton().disabled).toBe(true)
    fireEvent.change(input(), { target: { value: 'chest pain since this morning' } })
    fireEvent.click(sendButton())

    expect(send).toHaveBeenCalledTimes(1)
    // Clearing the box returned it to idle, so the retyped text is a typed message.
    expect(send).toHaveBeenCalledWith('chest pain since this morning', { inputMode: 'text' })
    expect(input().value).toBe('')
  })

  it('shows the detected-language chip and sends the language with the dictated draft', async () => {
    render(<Harness send={send} />)
    const ws = await startRecording()
    expect(dialog().querySelector('.vp-lang')).toBeNull() // nothing detected yet
    act(() => ws.receive(transcriptEvent([result('r', 'मुझे बुखार', true, 'hi-IN')])))
    expect(screen.getByLabelText('Detected language: Hindi').textContent).toBe('Hindi')
    await stopWithFinal(ws, 'मुझे बुखार है', 'hi-IN')

    fireEvent.click(sendButton())
    expect(send).toHaveBeenCalledWith('मुझे बुखार है', { inputMode: 'voice', lang: 'hi-IN' })

    fireEvent.change(input(), { target: { value: 'typed only' } })
    fireEvent.click(sendButton())
    expect(send).toHaveBeenLastCalledWith('typed only', { inputMode: 'text' })
  })

  it('opening the mic stops a reply that is being read aloud', async () => {
    const audio = { play: vi.fn(async () => {}), pause: vi.fn(), removeAttribute: vi.fn() }
    vi.stubGlobal('Audio', vi.fn(function FakeAudio() { return audio }))
    URL.createObjectURL = vi.fn(() => 'blob:tts')
    URL.revokeObjectURL = vi.fn()
    render(<Harness send={send} />)
    await act(() => ttsPlayer.play('bot-1', async () => new Blob(['mp3'])))
    expect(ttsPlayer.getState()).toEqual({ id: 'bot-1', status: 'playing' })

    await startRecording()
    expect(audio.pause).toHaveBeenCalled()
    expect(ttsPlayer.getState().status).toBe('idle')
    expect(await ttsPlayer.play('bot-1', async () => new Blob(['mp3']))).toBe(false) // never while the mic is open
  })

  it('re-recording appends; Cancel (Esc) keeps the text from before it', async () => {
    render(<Harness send={send} />)
    fireEvent.change(input(), { target: { value: 'I have' } })

    let ws = await startRecording()
    act(() => ws.receive(transcriptEvent([result('r', 'something else', true)])))
    expect(input().value).toBe('I have something else')
    fireEvent.keyDown(dialog(), { key: 'Escape' })
    await waitFor(() => expect(dialog()).toBeNull())
    expect(input().value).toBe('I have')

    ws = await startRecording()
    await stopWithFinal(ws, 'fever')
    expect(input().value).toBe('I have fever')
    expect(send).not.toHaveBeenCalled()
  })

  it('late Transcribe events after review cannot overwrite edits', async () => {
    render(<Harness send={send} />)
    const ws = await startRecording()
    await stopWithFinal(ws, 'headache')
    fireEvent.change(input(), { target: { value: 'bad headache' } })

    act(() => ws.receive(transcriptEvent([result('late', 'zzz', true)])))
    expect(input().value).toBe('bad headache')
  })

  it('backdrop clicks do nothing; focus starts on Stop', async () => {
    render(<Harness send={send} />)
    await startRecording()
    await waitFor(() => expect(document.activeElement.textContent).toBe('Stop'))
    const scrim = dialog().parentElement
    fireEvent.mouseDown(scrim)
    fireEvent.click(scrim)
    expect(dialog()).not.toBeNull()
  })
})

describe('voice-reactive ripple', () => {
  it('shows .speaking only while the level is above the threshold', async () => {
    render(<Harness send={send} />)
    await startRecording()
    const wrap = dialog().querySelector('.vp-mic-wrap')

    await new Promise((r) => setTimeout(r, 250))
    expect(wrap.classList.contains('speaking')).toBe(false)
    expect(screen.getByText('Say something…')).toBeTruthy()

    audio.amp = 0.3
    await waitFor(() => expect(wrap.classList.contains('speaking')).toBe(true))
    expect(screen.getByText('Listening…')).toBeTruthy()
    expect(Number(wrap.style.getPropertyValue('--level'))).toBeGreaterThan(0)

    audio.amp = 0
    await waitFor(() => expect(wrap.classList.contains('speaking')).toBe(false))
  })
})

describe('microphone lifecycle', () => {
  const released = (i) => {
    expect(audio.tracks[i].stop).toHaveBeenCalled()
    expect(audio.analysers[i].disconnect).toHaveBeenCalled()
    expect(audio.sources[i].disconnect).toHaveBeenCalled()
    expect(audio.contexts[i].close).toHaveBeenCalled()
  }

  it('opens the mic once per recording and releases rAF + nodes on stop and cancel', async () => {
    const caf = vi.spyOn(window, 'cancelAnimationFrame')
    render(<Harness send={send} />)

    await stopWithFinal(await startRecording(), 'one')
    expect(audio.getUserMedia).toHaveBeenCalledTimes(1)
    expect(audio.sources).toHaveLength(1) // the level meter reuses the pipeline's source
    released(0)
    expect(caf).toHaveBeenCalled()

    caf.mockClear()
    await startRecording()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel recording' }))
    await waitFor(() => expect(dialog()).toBeNull())
    expect(audio.getUserMedia).toHaveBeenCalledTimes(2)
    released(1)
    expect(caf).toHaveBeenCalled()
  })

  it('releases everything on unmount mid-recording', async () => {
    const { unmount } = render(<Harness send={send} />)
    await startRecording()
    unmount()
    released(0)
  })

  it('permission denied: error state with a settings hint, no animation; Close restores the input', async () => {
    audio.getUserMedia.mockRejectedValueOnce(Object.assign(new Error('denied'), { name: 'NotAllowedError' }))
    render(<Harness send={send} />)
    fireEvent.change(input(), { target: { value: 'typed' } })
    fireEvent.click(screen.getByRole('button', { name: /voice input/i }))

    await waitFor(() => expect(screen.getByText('Microphone access is blocked.')).toBeTruthy())
    expect(screen.getByText(/site settings/)).toBeTruthy()
    expect(dialog().querySelectorAll('.vp-ring')).toHaveLength(0)
    expect(screen.queryByRole('button', { name: 'Stop' })).toBeNull()

    fireEvent.click(screen.getByRole('button', { name: 'Close' }))
    await waitFor(() => expect(dialog()).toBeNull())
    expect(input().value).toBe('typed')
  })
})
