// Token storage for the browser.
//
// TOKENS LIVE IN MEMORY ONLY. Nothing is written to localStorage or
// sessionStorage — anything readable by JavaScript is readable by injected
// JavaScript, and a Cognito refresh token is valid for 30 days.
//
// Reload does NOT log the user out. Cognito's Hosted UI keeps its own session
// cookie on the *.auth.<region>.amazoncognito.com domain, so after a refresh we
// bounce through /oauth2/authorize and come straight back with a new code —
// no credential prompt, and no long-lived secret persisted in the browser.
// See restoreSession() in hostedUi.js.
//
// sessionStorage is used only for short-lived, non-credential flow state: the
// PKCE verifier, the CSRF state value, the post-login path, and a one-shot
// "already tried restoring" flag that prevents redirect loops.

let accessToken = null
let idToken = null
let refreshToken = null
let expiresAt = 0 // epoch seconds

export const setTokens = ({ access, id, refresh, expiresIn }) => {
  accessToken = access ?? null
  idToken = id ?? null
  // A refresh_token grant response omits refresh_token; keep the existing one.
  if (refresh) refreshToken = refresh
  expiresAt = expiresIn ? Math.floor(Date.now() / 1000) + Number(expiresIn) : 0
}

// The ACCESS token is what API Gateway's JWT authorizer validates.
export const getAccessToken = () => accessToken
export const getIdToken = () => idToken
export const getRefreshToken = () => refreshToken
export const hasSession = () => Boolean(accessToken)

// Treat a token expiring within 60s as expired so an in-flight request does not
// race the boundary.
export const isExpired = () => !expiresAt || expiresAt - 60 <= Math.floor(Date.now() / 1000)

export const clearTokens = () => {
  accessToken = null
  idToken = null
  refreshToken = null
  expiresAt = 0
}

/**
 * Read a claim from the ID token WITHOUT verifying the signature.
 *
 * Display purposes only (e.g. showing the user's email in the profile header).
 * Never use this for an authorization decision — signature validation is API
 * Gateway's job, and the backend derives identity from x-user-id, not from
 * anything this function returns.
 */
export const readIdClaims = () => {
  if (!idToken) return {}
  try {
    return JSON.parse(atob(idToken.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')))
  } catch {
    return {}
  }
}
