// API client — talks to the same FastAPI backend as the web app.
// All auth is centralized here: it attaches a valid Cognito ID token (refreshing
// first if needed), and on a 401 it refreshes once and retries before giving up.
import { getStoredSession, getValidAccessToken, getValidIdToken, refreshSession, signOut } from './cognito'
import { API_BASE_URL } from '../config'

// Fail fast instead of letting fetch hang ~60s when the backend is unreachable.
const DEFAULT_TIMEOUT_MS = 12000

// fetch with an AbortController timeout. Turns a hang into a quick, clear error.
export const fetchWithTimeout = async (url, options = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    return await fetch(url, { ...options, signal: controller.signal })
  } catch (e) {
    if (e.name === 'AbortError') {
      throw new Error(`Can't reach the server (timed out). Check that the backend is running and EXPO_PUBLIC_API_URL points at your computer's LAN IP.`)
    }
    if (e.message === 'Network request failed') {
      throw new Error(`Network request failed — the app can't reach ${API_BASE_URL}. Make sure the backend is running on 0.0.0.0:5174, the phone is on the same Wi-Fi, and EXPO_PUBLIC_API_URL is your computer's LAN IP.`)
    }
    throw e
  } finally {
    clearTimeout(timer)
  }
}

const call = async (path, method, body, token, timeoutMs) => {
  const headers = { 'Content-Type': 'application/json' }
  if (token) headers.Authorization = `Bearer ${token}`
  return fetchWithTimeout(`${API_BASE_URL}/api${path}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  }, timeoutMs)
}

// responseType 'blob' returns the body as a Blob (e.g. read-aloud MP3).
// `useAccessToken`: send the Cognito ACCESS token (the admin API re-verifies
// token_use=access); every other route keeps the ID token as before.
export const request = async (path, { method = 'GET', body, signOutOn401 = true, responseType = 'json', useAccessToken = false } = {}, timeoutMs = DEFAULT_TIMEOUT_MS) => {
  const token = useAccessToken ? await getValidAccessToken() : await getValidIdToken()
  let res = await call(path, method, body, token, timeoutMs)

  // A 401 despite a "valid" token means it was rejected server-side (e.g. clock
  // skew or rotated keys). Try exactly one forced refresh + retry.
  if (res.status === 401) {
    const fresh = await refreshSession()
    if (fresh) {
      res = await call(path, method, body, useAccessToken ? getStoredSession()?.accessToken : fresh, timeoutMs)
    }
    if (res.status === 401) {
      // Callers may opt out of the global sign-out (e.g. the sign-in landing-route
      // probe): a hiccup on that one call must not tear down a just-created session.
      if (signOutOn401) await signOut()
      throw new Error('Your session has expired. Please sign in again.')
    }
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    let code
    try { const d = await res.json(); detail = d.detail || detail; code = d.code } catch { /* non-json */ }
    const err = new Error(typeof detail === 'string' ? detail : `Request failed (${res.status})`)
    err.status = res.status
    if (code) err.code = code
    throw err
  }
  if (res.status === 204) return null
  if (responseType === 'blob') return res.blob()
  if (responseType === 'text') return res.text()
  return res.json()
}

// Profile checks happen during sign-in. Keep them reasonably short, but not so
// short that a normal mobile→AWS round trip aborts (which wrongly routes an
// existing user to profile setup).
const PROFILE_TIMEOUT_MS = 8000
export const getProfile = (opts = {}) => request('/profile', opts, PROFILE_TIMEOUT_MS)
export const saveProfile = (profile) => request('/profile', { method: 'PUT', body: profile }, PROFILE_TIMEOUT_MS)
// `q` searches BOTH chat titles and message bodies (server-side).
export const listConsultations = (opts = {}, q) =>
  request(`/consultations${q && q.trim() ? `?q=${encodeURIComponent(q.trim())}` : ''}`, opts)

// Unsend: soft-deletes the message server-side (row kept, flagged deleted).
export const unsendMessage = (consultationId, messageId) =>
  request(`/consultations/${consultationId}/messages/${messageId}`, { method: 'DELETE' })
export const createConsultation = (title) => request('/consultations', { method: 'POST', body: { title } })
export const getMessages = (id) => request(`/consultations/${id}/messages`)
export const deleteConsultation = (id) => request(`/consultations/${id}`, { method: 'DELETE' })
export const renameConsultation = (id, title) => request(`/consultations/${id}`, { method: 'PATCH', body: { title } })
// meta: { inputMode: 'voice' | 'text', lang } — lang is the language Transcribe
// identified for a dictated message; the server replies in it.
export const sendMessage = (id, content, attachmentIds = [], { inputMode, lang } = {}) =>
  request(`/consultations/${id}/messages`, { method: 'POST', body: { content, attachmentIds, ...(inputMode && { inputMode }), ...(lang && { lang }) } })
// The reply in another language: { content, target, lang }. Cached server-side.
// target: 'en' | 'hi' | 'hinglish'. The model call can be slow, hence 30 s.
export const translateMessage = (consultationId, messageId, target) =>
  request(`/consultations/${consultationId}/messages/${messageId}/translate`, { method: 'POST', body: { target } }, 30000)
export const setMessageFeedback = (consultationId, messageId, feedback) =>
  request(`/consultations/${consultationId}/messages/${messageId}/feedback`, { method: 'POST', body: { feedback } })

// --- account security PINs ---
export const listPins = () => request('/security/pins')
export const createPin = ({ pin, label }) => request('/security/pins', { method: 'POST', body: { pin, label } })
// Deleting a PIN requires the PIN itself (backend verifies it).
export const deletePin = (pinId, pin) => request(`/security/pins/${pinId}`, { method: 'DELETE', body: { pin } })

// --- admin console (aggregates only; the backend authorises every call) ---
const adminOpts = (extra = {}) => ({ useAccessToken: true, ...extra })
const rangeQuery = ({ from, to, granularity }) => `from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}&granularity=${encodeURIComponent(granularity)}`
export const getAdminAnalytics = (range) => request(`/admin/analytics?${rangeQuery(range)}`, adminOpts(), 20000)
export const exportAdminAnalyticsCsv = (range) => request(`/admin/analytics?${rangeQuery(range)}&format=csv`, adminOpts({ responseType: 'text' }), 20000)
export const getAdminUsers = (range) => request(`/admin/users?${rangeQuery(range)}`, adminOpts(), 20000)
export const getAdminFeedback = (range) => request(`/admin/feedback?${rangeQuery(range)}`, adminOpts(), 20000)
export const getSystemHealth = () => request('/admin/system-health', adminOpts(), 20000)
export const listAdmins = () => request('/admin/admins', adminOpts())
export const removeAdmin = (sub, { confirmSelf = false } = {}) =>
  request(`/admin/admins/${encodeURIComponent(sub)}${confirmSelf ? '?confirm_self=true' : ''}`, adminOpts({ method: 'DELETE' }))
export const listInvitations = () => request('/admin/invitations', adminOpts())
export const createInvitation = (email) => request('/admin/invitations', adminOpts({ method: 'POST', body: { email } }))
export const revokeInvitation = (id) => request(`/admin/invitations/${encodeURIComponent(id)}`, adminOpts({ method: 'DELETE' }))
export const getAuditLogs = (cursor) => request(`/admin/audit-logs?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`, adminOpts())
