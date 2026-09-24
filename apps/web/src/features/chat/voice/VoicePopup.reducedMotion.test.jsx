// @vitest-environment jsdom
// Separate file: framer-motion reads prefers-reduced-motion once per module load.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, expect, it, vi } from 'vitest'
import { VOICE_POPUP_CSS } from './voicePopup.styles'
import { FakeWebSocket, Harness, installAudioFakes } from './voiceTestHarness.jsx'

vi.mock('../../../services/api/httpClient', () => ({
  request: vi.fn(async () => ({ url: 'wss://transcribe.test/stream', expiresIn: 60, maxSeconds: 60 })),
}))

afterEach(() => { cleanup(); vi.unstubAllGlobals() })

it('reduced motion: no ripple rings, even while speaking', async () => {
  const audio = installAudioFakes({ reducedMotion: true })
  render(<Harness send={vi.fn()} />)
  fireEvent.click(screen.getByRole('button', { name: /voice input/i }))
  await waitFor(() => expect(FakeWebSocket.instances.length).toBe(1))
  act(() => FakeWebSocket.instances[0].open())
  audio.amp = 0.3
  await waitFor(() => expect(screen.getByText('Listening…')).toBeTruthy())

  const popup = screen.getByRole('dialog')
  expect(popup.querySelectorAll('.vp-ring')).toHaveLength(0)
  expect(popup.querySelector('.vp-mic-wrap').classList.contains('speaking')).toBe(false)
  // The stylesheet also disables the ripple for reduced motion.
  expect(VOICE_POPUP_CSS).toMatch(/prefers-reduced-motion: reduce\)\s*\{\s*\.vp-ring \{ animation: none !important/)
})
