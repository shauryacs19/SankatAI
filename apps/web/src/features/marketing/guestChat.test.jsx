// @vitest-environment jsdom
// Home-page guest chat: no account and no token, replies keep their server
// signature, and "Save this chat" hands the conversation to sign-up.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ui'
import HeroChat from './HeroChat.jsx'
import { stashGuestChat, takeStashedGuestChat, toWire } from '../chat/guestChat'

const reply = (content, i) => ({ role: 'assistant', content: JSON.stringify(content), createdAt: `2026-10-18T10:0${i}:00+00:00`, lang: 'en-IN', isOfflineFallback: false, signature: `sig${i}` })

let calls
beforeEach(() => {
  calls = []
  globalThis.fetch = vi.fn(async (url, init) => {
    const body = JSON.parse(init.body)
    calls.push({ url, headers: init.headers, body })
    const n = body.messages.filter((m) => m.role === 'user').length
    const content = n === 1 ? { followUpQuestions: ['How high is the fever?', 'Any rash?'] } : { severity: 'MODERATE', riskScore: 40, advice: 'Rest and drink water.' }
    return new Response(JSON.stringify({ reply: reply(content, n) }), { status: 200, headers: { 'Content-Type': 'application/json' } })
  })
})
afterEach(() => { cleanup(); sessionStorage.clear() })

const renderGuest = (props = {}) => render(
  <ToastProvider><HeroChat authed={false} onAskSignedIn={vi.fn()} onSaveGuest={vi.fn()} {...props} /></ToastProvider>,
)

describe('guest chat on the home page', () => {
  it('a quick-help topic starts the chat at once, with no token', async () => {
    renderGuest()
    fireEvent.click(screen.getByRole('button', { name: /fever or infection/i }))
    await waitFor(() => expect(screen.getByText('How high is the fever?')).toBeTruthy())
    expect(calls[0].url).toBe('/api/guest/chat')
    expect(calls[0].headers.Authorization).toBeUndefined()
    expect(calls[0].body.messages).toEqual([expect.objectContaining({ role: 'user', content: expect.stringMatching(/fever/i) })])
    expect(screen.getByText(/Guest chat/)).toBeTruthy()
  })

  it('sends the signed reply back as history on the next turn', async () => {
    renderGuest()
    fireEvent.click(screen.getByRole('button', { name: /fever or infection/i }))
    await screen.findByText('How high is the fever?')
    const box = screen.getByLabelText('Reply to SankatAI')
    fireEvent.change(box, { target: { value: 'About 101F' } })
    fireEvent.keyDown(box, { key: 'Enter' })
    await screen.findByText('Rest and drink water.')
    const sent = calls[1].body.messages
    expect(sent.map((m) => m.role)).toEqual(['user', 'assistant', 'user'])
    expect(sent[1].signature).toBe('sig1')
  })

  it('Save this chat passes the conversation on', async () => {
    const onSaveGuest = vi.fn()
    renderGuest({ onSaveGuest })
    fireEvent.click(screen.getByRole('button', { name: /fever or infection/i }))
    await screen.findByText('How high is the fever?')
    fireEvent.click(screen.getAllByRole('button', { name: /save this chat/i })[0])
    const [guestId, messages] = onSaveGuest.mock.calls[0]
    expect(guestId).toMatch(/^[0-9a-f-]{36}$/)
    expect(toWire(messages).map((m) => m.role)).toEqual(['user', 'assistant'])
  })

  it('signed-in visitors go to their own chat instead', () => {
    const onAskSignedIn = vi.fn()
    render(<ToastProvider><HeroChat authed onAskSignedIn={onAskSignedIn} onSaveGuest={vi.fn()} /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: /fever or infection/i }))
    expect(onAskSignedIn).toHaveBeenCalledWith(expect.stringMatching(/fever/i))
    expect(calls).toHaveLength(0)
  })
})

describe('stash for sign-up', () => {
  it('keeps only sent turns and is taken once', () => {
    stashGuestChat('g1', [
      { sender: 'user', text: 'hi', createdAt: 't0', status: 'received' },
      { sender: 'bot', raw: '{}', createdAt: 't1', lang: 'en-IN', signature: 's' },
      { sender: 'user', text: 'lost', createdAt: 't2', status: 'failed' },
      { sender: 'error', text: 'x' },
    ])
    const data = takeStashedGuestChat()
    expect(data.messages.map((m) => m.role)).toEqual(['user', 'assistant'])
    expect(takeStashedGuestChat()).toBeNull()
  })
})
