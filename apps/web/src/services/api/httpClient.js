// Browser API client.
//
// Auth is Bearer-token based: every request carries the Cognito ACCESS token,
// which the API Gateway JWT authorizer validates before the request reaches
// FastAPI. No cookies, so no `credentials: 'include'` and no CSRF surface.
//
// Requests go to /api/* on this origin; CloudFront forwards that path to API
// Gateway, so calls stay same-origin and skip CORS preflight entirely.
import { getValidAccessToken, refreshSession, signOut } from '../auth/cognito'

const authHeaders = async () => {
  const token = await getValidAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

// The session is unusable: clear it and let AuthContext send the user to
// /login?returnTo=<this page> (ProtectedRoute does the navigation).
const expire = () => {
  signOut()
  window.dispatchEvent(new CustomEvent('sankatai:auth-expired'))
  return Object.assign(new Error('Your session has expired. Please sign in again.'), { status: 401 })
}

// responseType 'blob' returns the body as a Blob (e.g. read-aloud MP3),
// 'text' the raw body (e.g. a CSV export).
export const request = async (path, { method = 'GET', body, responseType = 'json' } = {}) => {
  const send = async () =>
    fetch(`/api${path}`, {
      method,
      headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    })

  let res = await send()

  // API Gateway rejects an expired/invalid token with 401 before the backend is
  // reached. Refresh once and retry; a second 401 means the session is gone.
  if (res.status === 401) {
    try {
      await refreshSession()
    } catch {
      throw expire()
    }
    res = await send()
    if (res.status === 401) throw expire()
  }

  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    let code
    try {
      const data = await res.json()
      detail = (typeof data.detail === 'string' && data.detail) || data.message || detail
      code = data.code
    } catch {
      // Non-JSON error body (e.g. an API Gateway HTML fault) — keep the status text.
    }
    // `status` / `code` let callers branch (e.g. 403 on admin pages).
    throw Object.assign(new Error(detail), { status: res.status, code })
  }

  if (res.status === 204) return null
  if (responseType === 'blob') return res.blob()
  if (responseType === 'text') return res.text()
  return res.json()
}
