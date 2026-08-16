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
export const sendMessage = (id, content, attachmentIds = []) =>
  request(`/consultations/${id}/messages`, { method: 'POST', body: { content, attachmentIds } })
// feedback: 'like' | 'dislike' | null (null clears it)
export const setMessageFeedback = (consultationId, messageId, feedback) =>
  request(`/consultations/${consultationId}/messages/${messageId}/feedback`, { method: 'POST', body: { feedback } })
