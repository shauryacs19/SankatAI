// @vitest-environment jsdom
// Reply translation: English -> Hindi -> Hinglish -> English, starting from the
// reply's own language; each language fetched once; severity never changes.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { replyLanguageOf, nextTranslation } from '@sankatai/shared'
import { ToastProvider } from '../../components/ui'

const api = vi.hoisted(() => ({ translateMessage: vi.fn(), fetchTts: vi.fn() }))
vi.mock('./services/chatApi', () => api)

import { AssistantMessage } from './components/ChatMessages.jsx'

const reply = (advice, extra = {}) => JSON.stringify({ severity: 'MODERATE', riskScore: 40, advice, ...extra })
const bubble = (over = {}) => ({
  id: 'm1', sender: 'bot', text: 'Rest and drink water.', severity: 'MODERATE', riskScore: 40,
  raw: reply('Rest and drink water.'), lang: 'en-IN', createdAt: '2026-09-26T03:00:00Z', feedback: null, ...over,
})
const renderReply = (m) => render(
  <ToastProvider><AssistantMessage m={m} onFeedback={() => {}} onShare={() => {}} consultationId="c1" /></ToastProvider>,
)

beforeEach(() => {
  api.translateMessage.mockReset()
  api.translateMessage.mockImplementation(async (_c, _m, target) => ({
    target, content: reply({ hi: 'आराम करें और पानी पिएं।', hinglish: 'Aaram karein aur paani piyein.', en: 'Rest and drink water.' }[target]),
  }))
})
afterEach(cleanup)

describe('translate cycle', () => {
  it('cycles English -> Hindi -> Hinglish -> English, fetching each language once', async () => {
    renderReply(bubble())
    fireEvent.click(screen.getByRole('button', { name: 'Show this reply in Hindi' }))
    expect(await screen.findByText('आराम करें और पानी पिएं।')).toBeTruthy()
    expect(screen.getByText('Translated to Hindi')).toBeTruthy()
    expect(api.translateMessage).toHaveBeenLastCalledWith('c1', 'm1', 'hi')

    fireEvent.click(screen.getByRole('button', { name: 'Show this reply in Hinglish' }))
    expect(await screen.findByText('Aaram karein aur paani piyein.')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Show this reply in English' }))
    expect(await screen.findByText('Rest and drink water.')).toBeTruthy()
    expect(screen.queryByText(/Translated to/)).toBeNull()
    expect(api.translateMessage).toHaveBeenCalledTimes(2) // English is the original: no call

    fireEvent.click(screen.getByRole('button', { name: 'Show this reply in Hindi' }))
    expect(await screen.findByText('आराम करें और पानी पिएं।')).toBeTruthy()
    expect(api.translateMessage).toHaveBeenCalledTimes(2) // cached
  })

  it('starts from a Hindi reply and keeps the severity badge', async () => {
    renderReply(bubble({ text: 'आराम करें', raw: reply('आराम करें'), lang: 'hi-IN' }))
    expect(screen.getByText(/MODERATE|Moderate/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show this reply in Hinglish' }))
    expect(await screen.findByText('Aaram karein aur paani piyein.')).toBeTruthy()
    expect(screen.getByText(/MODERATE|Moderate/i)).toBeTruthy()
  })

  it('translates a Hindi reply labelled English (older replies) to real English', async () => {
    renderReply(bubble({ text: 'आराम करें', raw: reply('आराम करें'), lang: 'en-IN' }))
    // The script says Hindi, so the cycle starts there: next is Hinglish, then English.
    fireEvent.click(screen.getByRole('button', { name: 'Show this reply in Hinglish' }))
    expect(await screen.findByText('Aaram karein aur paani piyein.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Show this reply in English' }))
    expect(await screen.findByText('Rest and drink water.')).toBeTruthy()
    expect(api.translateMessage).toHaveBeenLastCalledWith('c1', 'm1', 'en')
    fireEvent.click(screen.getByRole('button', { name: 'Show this reply in Hindi' }))
    expect(await screen.findByText('आराम करें')).toBeTruthy()
  })

  it('stays on the current language when translation fails', async () => {
    api.translateMessage.mockRejectedValueOnce(new Error('Translation isn’t available right now.'))
    renderReply(bubble())
    fireEvent.click(screen.getByRole('button', { name: 'Show this reply in Hindi' }))
    await waitFor(() => expect(screen.getByText(/Translation isn’t available/)).toBeTruthy())
    expect(screen.getByText('Rest and drink water.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Show this reply in Hindi' })).toBeTruthy()
  })
})

describe('shared cycle rules', () => {
  it.each([
    ['en-IN', 'Rest', 'en'], ['hi-IN', 'आराम', 'hi'], ['hi-IN', 'Aaram', 'hinglish'], [null, 'x', 'en'],
    ['en-IN', 'आराम', 'hi'],
  ])('%s %s -> %s', (lang, content, expected) => expect(replyLanguageOf(lang, content)).toBe(expected))

  it('wraps around', () => {
    expect(['en', 'hi', 'hinglish'].map(nextTranslation)).toEqual(['hi', 'hinglish', 'en'])
  })
})
