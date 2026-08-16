// Cognito Hosted UI — OAuth 2.0 Authorization Code flow with PKCE.
//
//   sign-in   : redirect to /oauth2/authorize?response_type=code&code_challenge=...
//   callback  : exchange ?code= for tokens at /oauth2/token with the verifier
//   reload    : silent re-authorize using Cognito's own session cookie
//   sign-out  : /logout, which clears that cookie
//
// The app client is public (no secret); PKCE is what binds the authorization
// code to this browser.

import { createChallenge, createState, createVerifier } from './pkce'
import {
  clearTokens,
  getAccessToken,
  getRefreshToken,
  hasSession,
  isExpired,
  readIdClaims,
  setTokens,
} from './tokenStore'

const DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN // https://sankatai-auth.auth.<region>.amazoncognito.com
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID
const REDIRECT_URI = import.meta.env.VITE_COGNITO_REDIRECT_URI || `${window.location.origin}/auth/callback`
const SCOPES = 'openid email profile'

export const isCognitoConfigured = () => Boolean(DOMAIN && CLIENT_ID)

// Short-lived flow state. NOT credentials — see the tokenStore header.
const SS = {
  verifier: 'sankatai_pkce_verifier',
  state: 'sankatai_oauth_state',
  returnTo: 'sankatai_return_to',
  restoreTried: 'sankatai_restore_tried',
}

const ss = {
  get: (k) => { try { return sessionStorage.getItem(k) } catch { return null } },
  set: (k, v) => { try { sessionStorage.setItem(k, v) } catch { /* private mode */ } },
  del: (k) => { try { sessionStorage.removeItem(k) } catch { /* private mode */ } },
}

const requireConfig = () => {
  if (!isCognitoConfigured()) {
    throw new Error('Cognito is not configured. Set VITE_COGNITO_DOMAIN and VITE_COGNITO_CLIENT_ID.')
  }
}

/**
 * Begin the authorization-code flow.
 *
 * @param {object}  opts
 * @param {boolean} opts.silent  Reuse Cognito's session cookie if present.
 *                               Used on reload so the user is not re-prompted.
 */
const authorize = async ({ silent = false } = {}) => {
  requireConfig()
  const verifier = createVerifier()
  const state = createState()
  ss.set(SS.verifier, verifier)
  ss.set(SS.state, state)
  if (!silent) ss.set(SS.returnTo, window.location.pathname + window.location.search)

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SCOPES,
    state,
    code_challenge: await createChallenge(verifier),
    code_challenge_method: 'S256',
  })

  window.location.assign(`${DOMAIN}/oauth2/authorize?${params}`)
}

export const signIn = () => authorize({ silent: false })

const tokenRequest = async (body) => {
  const res = await fetch(`${DOMAIN}/oauth2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  })
  if (!res.ok) {
    let detail = 'Sign-in failed.'
    try {
      const data = await res.json()
      // Cognito returns {error, error_description}; never log the raw body,
      // it can echo the code/verifier.
      detail = data.error_description || data.error || detail
    } catch {
      // Non-JSON error page — keep the generic message.
    }
    throw new Error(detail)
  }
  return res.json()
}

/**
 * Handle the /auth/callback redirect: validate state, exchange the code.
 * Returns the signed-in user, or null when there is no code in the URL.
 */
export const handleRedirectCallback = async () => {
  const url = new URL(window.location.href)
  const code = url.searchParams.get('code')
  const returnedState = url.searchParams.get('state')
  const error = url.searchParams.get('error')

  // Strip the query string immediately so the code never lingers in history,
  // bookmarks, or a Referer header.
  const cleanUrl = () => window.history.replaceState({}, '', url.pathname)

  if (error) {
    cleanUrl()
    ss.del(SS.verifier)
    ss.del(SS.state)
    // A silent restore against an expired Cognito session lands here. That is
    // an ordinary logged-out state, not a failure to surface.
    return null
  }
  if (!code) return null

  const expectedState = ss.get(SS.state)
  const verifier = ss.get(SS.verifier)
  ss.del(SS.state)
  ss.del(SS.verifier)

  if (!expectedState || returnedState !== expectedState) {
    cleanUrl()
    throw new Error('Sign-in could not be verified. Please try again.')
  }
  if (!verifier) {
    cleanUrl()
    throw new Error('Sign-in session was lost. Please try again.')
  }

  const tokens = await tokenRequest({
    grant_type: 'authorization_code',
    code,
    redirect_uri: REDIRECT_URI,
    code_verifier: verifier,
  })

  setTokens({
    access: tokens.access_token,
    id: tokens.id_token,
    refresh: tokens.refresh_token,
    expiresIn: tokens.expires_in,
  })

  ss.del(SS.restoreTried)
  cleanUrl()

  const returnTo = ss.get(SS.returnTo)
  ss.del(SS.returnTo)
  return { user: currentUser(), returnTo }
}

// Single-flight: concurrent 401s must not each start a refresh.
let refreshInFlight = null

const doRefresh = async () => {
  const token = getRefreshToken()
  if (!token) throw new Error('No refresh token.')
  const tokens = await tokenRequest({ grant_type: 'refresh_token', refresh_token: token })
  setTokens({
    access: tokens.access_token,
    id: tokens.id_token,
    expiresIn: tokens.expires_in,
  })
  return currentUser()
}

export const refreshSession = () => {
  if (!refreshInFlight) {
    refreshInFlight = doRefresh().finally(() => { refreshInFlight = null })
  }
  return refreshInFlight
}

/** A valid access token for API Gateway, refreshing first if needed. */
export const getValidAccessToken = async () => {
  if (!hasSession()) return null
  if (!isExpired()) return getAccessToken()
  try {
    await refreshSession()
    return getAccessToken()
  } catch {
    clearTokens()
    return null
  }
}

export const currentUser = () => {
  const claims = readIdClaims()
  return claims.sub ? { userId: claims.sub, email: claims.email || null } : null
}

/**
 * Restore the session after a page reload.
 *
 * Tokens are memory-only, so there is nothing to read back. Instead we rely on
 * Cognito's Hosted UI session cookie: redirecting to /oauth2/authorize returns
 * a fresh code immediately, with no credential prompt, if that cookie is still
 * valid. This is why a reload does not log the user out despite storing nothing.
 *
 * The one-shot `restoreTried` flag stops an infinite redirect loop when the
 * Cognito session really has expired.
 *
 * @returns {'restoring'|'anonymous'|object} 'restoring' means a redirect is
 *          under way and the caller should render nothing.
 */
export const restoreSession = async () => {
  if (hasSession()) return currentUser()
  if (!isCognitoConfigured()) return 'anonymous'

  if (ss.get(SS.restoreTried)) {
    ss.del(SS.restoreTried)
    return 'anonymous'
  }

  ss.set(SS.restoreTried, '1')
  await authorize({ silent: true })
  return 'restoring'
}

/** Federated sign-out: clears the Cognito session cookie, then returns home. */
export const signOut = async () => {
  clearTokens()
  ss.del(SS.restoreTried)
  ss.del(SS.returnTo)
  if (!isCognitoConfigured()) return
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    logout_uri: import.meta.env.VITE_COGNITO_LOGOUT_URI || `${window.location.origin}/`,
  })
  window.location.assign(`${DOMAIN}/logout?${params}`)
}
