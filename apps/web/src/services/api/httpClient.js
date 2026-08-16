// Browser API client.
//
// Auth is Bearer-token based: every request carries the Cognito ACCESS token,
// which the API Gateway JWT authorizer validates before the request reaches
// FastAPI. Tokens live in memory only (see services/auth/tokenStore.js) — no
// cookies, so no `credentials: 'include'` and no CSRF surface.
//
// Requests go to /api/* on this origin; CloudFront forwards that path to API
// Gateway, so calls stay same-origin and skip CORS preflight entirely.
import { clearTokens } from '../auth/tokenStore'
import { getValidAccessToken, refreshSession } from '../auth/hostedUi'

const authHeaders = async () => {
  const token = await getValidAccessToken()
  return token ? { Authorization: `Bearer ${token}` } : {}
}

const expire = () => {
  clearTokens()
  window.dispatchEvent(new CustomEvent('sankatai:auth-expired'))
  return new Error('Your session has expired. Please sign in again.')
}

export const request = async (path, { method = 'GET', body } = {}) => {
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
    try {
      const data = await res.json()
      detail = data.detail || data.message || detail
    } catch {
      // Non-JSON error body (e.g. an API Gateway HTML fault) — keep the status text.
    }
    throw new Error(detail)
  }

  if (res.status === 204) return null
  return res.json()
}
