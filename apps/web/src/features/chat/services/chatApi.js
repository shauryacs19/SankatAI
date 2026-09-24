// Chat / consultation HTTP calls.

import { request } from '../../../services/api/httpClient'

// `q` searches BOTH chat titles and message bodies (server-side).
export const listConsultations = (q) =>
  request(`/consultations${q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`)

// Unsend: soft-deletes the message server-side (row kept, flagged deleted).
export const unsendMessage = (consultationId, messageId) =>
  request(`/consultations/${consultationId}/messages/${messageId}`, { method: 'DELETE' })
export const createConsultation = (title) =>
  request('/consultations', { method: 'POST', body: { title } })
export const getMessages = (id) => request(`/consultations/${id}/messages`)
export const deleteConsultation = (id) =>
  request(`/consultations/${id}`, { method: 'DELETE' })
export const renameConsultation = (id, title) =>
  request(`/consultations/${id}`, { method: 'PATCH', body: { title } })
// meta: { inputMode: 'voice' | 'text', lang } — lang is the language Transcribe
// identified for a dictated message; the server replies in it.
export const sendMessage = (id, content, attachmentIds = [], { inputMode, lang } = {}) =>
  request(`/consultations/${id}/messages`, {
    method: 'POST',
    body: { content, attachmentIds, ...(inputMode && { inputMode }), ...(lang && { lang }) },
  })
// Read-aloud MP3 for an assistant reply (text + language are looked up server-side).
export const fetchTts = (consultationId, messageId) =>
  request('/tts', { method: 'POST', body: { consultationId, messageId }, responseType: 'blob' })
// feedback: 'like' | 'dislike' | null (null clears it)
export const setMessageFeedback = (consultationId, messageId, feedback) =>
  request(`/consultations/${consultationId}/messages/${messageId}/feedback`, { method: 'POST', body: { feedback } })
