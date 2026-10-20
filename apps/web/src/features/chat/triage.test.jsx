// @vitest-environment jsdom
// Triage engine v2 replies: structured sections + confidence, a disclaimer on
// every reply, the "No" reason follow-up, and the photo resize helper.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ui'

const api = vi.hoisted(() => ({ translateMessage: vi.fn(), fetchTts: vi.fn() }))
vi.mock('./services/chatApi', () => api)

import { AssistantMessage } from './components/ChatMessages.jsx'
import { toBubble } from './utils/format.jsx'
import { fitWithin } from './services/triageImages'

const finalReply = {
  reasoning: 'Fever for two days with body ache and no warning signs.', followUpQuestions: [], severity: 'MODERATE', riskScore: 48,
  advice: 'Rest and drink fluids; see a clinic within 48 hours.', likelyCauses: ['Viral fever'], homeCare: ['Paracetamol as directed'],
  warningSigns: ['Trouble breathing'], seekCare: 'Clinic within 24-48 hours.', confidence: 0.81, disclaimer: 'x',
  triage: { v: 2, mode: 'final' },
}
const question = {
  followUpQuestions: ['How long have you had the fever?'], severity: null, riskScore: null, advice: '', confidence: 0.4,
  safetyNote: 'If it gets worse while we talk, call 108 straight away.', triage: { v: 2, mode: 'ask', slot: 'duration' },
}
const bubble = (content) => toBubble({ id: 'm1', role: 'assistant', content: JSON.stringify(content), createdAt: '2026-10-19T03:00:00Z', lang: 'en-IN' })

afterEach(cleanup)

describe('v2 assessment', () => {
  it('shows when to get care, home care, warning signs, causes and the confidence', () => {
    render(<ToastProvider><AssistantMessage m={bubble(finalReply)} onFeedback={() => {}} onShare={() => {}} consultationId="c1" /></ToastProvider>)
    expect(screen.getByText('81% confident')).toBeTruthy()
    for (const text of ['When to get care', 'Clinic within 24-48 hours.', 'Paracetamol as directed', 'Trouble breathing', 'Viral fever', 'Why this rating']) {
      expect(screen.getByText(text)).toBeTruthy()
    }
  })

  it('a question carries the safety note and the disclaimer, but no severity', () => {
    render(<ToastProvider><AssistantMessage m={bubble(question)} onFeedback={() => {}} onShare={() => {}} consultationId="c1" /></ToastProvider>)
    expect(screen.getByText('How long have you had the fever?')).toBeTruthy()
    expect(screen.getByText(/call 108 straight away/)).toBeTruthy()
    expect(screen.getByText(/not a replacement for professional medical advice/i)).toBeTruthy()
    expect(screen.queryByText(/confident/)).toBeNull()
  })

  it('older replies render as before (no sections)', () => {
    render(<ToastProvider><AssistantMessage m={bubble({ severity: 'LOW', riskScore: 10, advice: 'Rest.' })} onFeedback={() => {}} onShare={() => {}} consultationId="c1" /></ToastProvider>)
    expect(screen.getByText('Rest.')).toBeTruthy()
    expect(screen.queryByText('When to get care')).toBeNull()
  })
})

describe('"No" follow-up', () => {
  it('asks why, and sends the reason, direction and comment', async () => {
    const onFeedback = vi.fn()
    const onFeedbackDetail = vi.fn(async () => true)
    const { rerender } = render(<ToastProvider><AssistantMessage m={bubble(finalReply)} onFeedback={onFeedback} onFeedbackDetail={onFeedbackDetail} onShare={() => {}} consultationId="c1" /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'No' }))
    expect(onFeedback).toHaveBeenCalledWith('m1', 'dislike')
    rerender(<ToastProvider><AssistantMessage m={{ ...bubble(finalReply), feedback: 'dislike' }} onFeedback={onFeedback} onFeedbackDetail={onFeedbackDetail} onShare={() => {}} consultationId="c1" /></ToastProvider>)

    const send = screen.getByRole('button', { name: 'Send' })
    expect(send.disabled).toBe(true) // nothing chosen yet
    fireEvent.click(screen.getByRole('button', { name: 'Wrong severity' }))
    fireEvent.click(screen.getByRole('button', { name: 'More serious' }))
    fireEvent.change(screen.getByLabelText('Comment (optional)'), { target: { value: 'It got much worse.' } })
    fireEvent.click(send)
    await waitFor(() => expect(onFeedbackDetail).toHaveBeenCalledWith('m1', { reason: 'wrong_severity', direction: 'higher', comment: 'It got much worse.' }))
    expect(await screen.findByText(/this helps SankatAI/)).toBeTruthy()
  })

  it('Yes does not open the follow-up', () => {
    render(<ToastProvider><AssistantMessage m={bubble(finalReply)} onFeedback={() => {}} onFeedbackDetail={vi.fn()} onShare={() => {}} consultationId="c1" /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Yes' }))
    expect(screen.queryByText(/What was wrong/)).toBeNull()
  })
})

describe('photo preparation', () => {
  it('scales the longest side to 2048 px and never upscales', () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: 2048, height: 1536 })
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 })
  })
})
