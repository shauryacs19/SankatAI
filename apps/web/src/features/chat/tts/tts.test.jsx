// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui'
import { getAutoRead, setAutoRead, shouldAutoRead } from './autoRead'
import SpeakerButton from './SpeakerButton.jsx'
import { ttsPlayer } from './ttsPlayer'

const fetchTts = vi.fn(async () => new Blob(['mp3'], { type: 'audio/mpeg' }))
vi.mock('../services/chatApi', () => ({ fetchTts: (...a) => fetchTts(...a) }))

let audios
beforeEach(() => {
  audios = []
  vi.stubGlobal('Audio', vi.fn(function FakeAudio(src) {
    const a = { src, play: vi.fn(async () => {}), pause: vi.fn(), removeAttribute: vi.fn(), onended: null }
    audios.push(a)
    return a
  }))
  let n = 0
  URL.createObjectURL = vi.fn(() => `blob:${++n}`)
  URL.revokeObjectURL = vi.fn()
  window.matchMedia = () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} })
  fetchTts.mockClear()
  ttsPlayer.setBlocked(false)
  ttsPlayer.stop()
})
afterEach(() => { cleanup(); vi.unstubAllGlobals(); localStorage.clear() })

const blob = async () => new Blob(['mp3'])

describe('player controller', () => {
  it('plays one reply at a time: starting another stops the current one', async () => {
    await ttsPlayer.play('a', blob)
    await ttsPlayer.play('b', blob)
    expect(audios[0].pause).toHaveBeenCalled()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
    expect(ttsPlayer.getState()).toEqual({ id: 'b', status: 'playing' })
  })

  it('a slower earlier load never starts after a newer one', async () => {
    let release
    const slow = ttsPlayer.play('a', () => new Promise((r) => { release = r }))
    await ttsPlayer.play('b', blob)
    release(new Blob(['late']))
    expect(await slow).toBe(false)
    expect(audios).toHaveLength(1)
    expect(ttsPlayer.getState().id).toBe('b')
  })

  it('pauses and resumes the same audio; revokes the URL when it ends', async () => {
    await ttsPlayer.play('a', blob)
    ttsPlayer.pause()
    expect(ttsPlayer.getState().status).toBe('paused')
    await ttsPlayer.play('a', blob)
    expect(audios).toHaveLength(1) // resumed, not re-fetched
    expect(audios[0].play).toHaveBeenCalledTimes(2)
    audios[0].onended()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:1')
    expect(ttsPlayer.getState().status).toBe('idle')
  })

  it('refuses to play and stops playback while the mic is open', async () => {
    await ttsPlayer.play('a', blob)
    ttsPlayer.setBlocked(true)
    expect(audios[0].pause).toHaveBeenCalled()
    expect(await ttsPlayer.play('b', blob)).toBe(false)
    ttsPlayer.setBlocked(false)
    expect(await ttsPlayer.play('b', blob)).toBe(true)
  })
})

describe('auto-read setting', () => {
  it('is off by default and only applies to spoken messages', () => {
    expect(getAutoRead()).toBe(false)
    expect(shouldAutoRead('voice')).toBe(false)
    setAutoRead(true)
    expect(shouldAutoRead('voice')).toBe(true)
    expect(shouldAutoRead('text')).toBe(false)
  })
})

describe('speaker button', () => {
  const renderButton = (id = 'm1') => render(<ToastProvider><SpeakerButton consultationId="c1" messageId={id} /></ToastProvider>)

  it('plays, shows a pause control, and pauses — keyboard operable', async () => {
    renderButton()
    const play = screen.getByRole('button', { name: 'Play reply' })
    play.focus()
    fireEvent.click(play) // Enter/Space on a <button> dispatch click
    await waitFor(() => expect(screen.getByRole('button', { name: 'Pause reply' })).toBeTruthy())
    expect(fetchTts).toHaveBeenCalledWith('c1', 'm1', undefined)
    fireEvent.click(screen.getByRole('button', { name: 'Pause reply' }))
    expect(screen.getByRole('button', { name: 'Play reply' })).toBeTruthy()
  })

  it('only the playing message shows Pause', async () => {
    render(<ToastProvider><SpeakerButton consultationId="c1" messageId="m1" /><SpeakerButton consultationId="c1" messageId="m2" /></ToastProvider>)
    const [first, second] = screen.getAllByRole('button', { name: 'Play reply' })
    fireEvent.click(first)
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Pause reply' })).toHaveLength(1))
    fireEvent.click(second)
    await waitFor(() => expect(ttsPlayer.getState().id).toBe('m2'))
    expect(screen.getAllByRole('button', { name: 'Pause reply' })).toHaveLength(1)
    expect(audios[0].pause).toHaveBeenCalled()
  })

  it('reports a failed read-aloud', async () => {
    fetchTts.mockRejectedValueOnce(new Error('Read-aloud is not available right now.'))
    renderButton()
    await act(async () => { fireEvent.click(screen.getByRole('button', { name: 'Play reply' })) })
    await waitFor(() => expect(screen.getByText('Read-aloud is not available right now.')).toBeTruthy())
  })
})
