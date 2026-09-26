// Cognito auth for the web app, via amazon-cognito-identity-js (the library the
// app already ships). Cognito stays the IdP. Ways in:
//   - password: the in-app form using SRP, so the password is never sent to
//     Cognito in clear or to our backend. Username, email or phone all work
//     (they are Cognito aliases).
//   - text-message code: Cognito's passwordless USER_AUTH flow (SMS_OTP),
//     called directly because the library doesn't implement it.
//   - Google / Facebook: only when the person presses the button, a redirect
//     to Cognito's /oauth2/authorize naming that provider (code + PKCE).
// Loading a page never redirects anywhere: it only reads the library's stored
// session (refreshing it if needed), silently.
//
// Token storage is the library's default: localStorage when "Remember me" is
// on, sessionStorage (this tab only) when it is off. This app never writes
// tokens or roles itself. Admin decisions are made by the backend from the
// verified JWT; the claims read here are for display only.

import {
  AuthenticationDetails,
  CognitoAccessToken,
  CognitoIdToken,
  CognitoRefreshToken,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
  CognitoUserSession,
} from 'amazon-cognito-identity-js'
import {
  buildAuthorizeUrl, createCognitoApi, exchangeAuthCode, isLinkedAccountRetry, normalizeUsername,
  parseSocialProviders, pkceChallenge, randomUrlSafe,
} from '@sankatai/shared'

const POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID
// Cognito OAuth origin (https://<prefix>.auth.<region>.amazoncognito.com) and
// the providers enabled on the app client ("Google,Facebook"); both come from
// Terraform outputs at build time.
const OAUTH_DOMAIN = import.meta.env.VITE_COGNITO_DOMAIN
const SOCIAL = parseSocialProviders(import.meta.env.VITE_SOCIAL_PROVIDERS)
const REGION = (POOL_ID || '').split('_')[0]

export const isCognitoConfigured = () => Boolean(POOL_ID && CLIENT_ID)

// Which storage the current session lives in. Non-sensitive preference only.
const PREF_KEY = 'sankatai_auth_storage'

const safeStorage = (name) => {
  try {
    const s = window[name]
    const probe = '__sankatai_probe__'
    s.setItem(probe, '1')
    s.removeItem(probe)
    return s
  } catch {
    return undefined // private mode: the library falls back to memory
  }
}

const pools = {}
const poolFor = (kind) => {
  if (!isCognitoConfigured()) {
    throw Object.assign(new Error('Sign-in is not configured.'), { code: 'NotConfigured' })
  }
  if (!pools[kind]) {
    // 'local' passes no Storage: the library default (localStorage).
    const Storage = kind === 'session' ? safeStorage('sessionStorage') : undefined
    pools[kind] = new CognitoUserPool({ UserPoolId: POOL_ID, ClientId: CLIENT_ID, ...(Storage ? { Storage } : {}) })
  }
  return pools[kind]
}

const readPref = () => {
  try { return localStorage.getItem(PREF_KEY) === 'session' ? 'session' : 'local' } catch { return 'local' }
}
const writePref = (kind) => {
  try { localStorage.setItem(PREF_KEY, kind) } catch { /* private mode */ }
}

const callback = (fn) => new Promise((resolve, reject) => fn((err, res) => (err ? reject(err) : resolve(res))))

// ── session ────────────────────────────────────────────────────────────────

let active = null // { user: CognitoUser, session: CognitoUserSession }

const userFromSession = (session) => {
  const claims = session.getIdToken().decodePayload()
  return {
    userId: claims.sub,
    email: claims.email || null,
    phone: claims.phone_number || null,
    name: claims.name || null,
    // The person's handle (Cognito preferred_username); null until chosen.
    username: claims.preferred_username || null,
    // Social-only accounts (google_… / facebook_…) have no password to change.
    hasPassword: !/^(google|facebook)_/i.test(claims['cognito:username'] || ''),
    // Display/UX only. The backend decides admin access from the verified token.
    groups: Array.isArray(claims['cognito:groups']) ? claims['cognito:groups'] : [],
  }
}

/**
 * Silent restore on app load. Tries the preferred storage, then the other.
 * Refreshes an expired session with the stored refresh token. Never redirects.
 * @returns {Promise<object|null>} the signed-in user, or null for a guest.
 */
export const restoreSession = async () => {
  if (!isCognitoConfigured()) return null
  const first = readPref()
  for (const kind of [first, first === 'local' ? 'session' : 'local']) {
    const user = poolFor(kind).getCurrentUser()
    if (!user) continue
    try {
      const session = await callback((cb) => user.getSession(cb))
      if (session?.isValid()) {
        active = { user, session }
        return userFromSession(session)
      }
    } catch {
      user.signOut() // unusable (revoked/expired refresh token): clear it
    }
  }
  active = null
  return null
}

/** Force a token refresh (after a 401, or to pick up new group claims). */
export const refreshSession = async () => {
  if (!active) throw Object.assign(new Error('No session.'), { code: 'NoSession' })
  const { user, session } = active
  const next = await callback((cb) => user.refreshSession(session.getRefreshToken(), cb))
  active = { user, session: next }
  return userFromSession(next)
}

const EXPIRY_SKEW_SECONDS = 60

/** A valid access token for API Gateway, refreshing first when near expiry. */
export const getValidAccessToken = async () => {
  if (!active) return null
  const exp = active.session.getAccessToken().getExpiration()
  if (exp - EXPIRY_SKEW_SECONDS <= Math.floor(Date.now() / 1000)) {
    try {
      await refreshSession()
    } catch {
      return null
    }
  }
  return active.session.getAccessToken().getJwtToken()
}

/** The ID token (carries email/email_verified), for the invitation accept call. */
export const getIdToken = () => (active ? active.session.getIdToken().getJwtToken() : null)

export const currentUser = () => (active ? userFromSession(active.session) : null)

/** Local sign-out: clears the library's stored tokens for this browser. */
export const signOut = () => {
  if (active) active.user.signOut()
  for (const kind of ['local', 'session']) {
    try { poolFor(kind).getCurrentUser()?.signOut() } catch { /* not configured */ }
  }
  active = null
}

/**
 * Store tokens obtained outside the library (text-message code, social
 * sign-in) exactly as an SRP sign-in would: in the library's own storage, so
 * restoreSession and refresh work the same for every way in.
 */
const adoptTokens = (tokens, kind) => {
  signOut()
  const session = new CognitoUserSession({
    IdToken: new CognitoIdToken({ IdToken: tokens.idToken }),
    AccessToken: new CognitoAccessToken({ AccessToken: tokens.accessToken }),
    RefreshToken: new CognitoRefreshToken({ RefreshToken: tokens.refreshToken }),
  })
  const user = new CognitoUser({ Username: session.getAccessToken().decodePayload().username, Pool: poolFor(kind) })
  user.setSignInUserSession(session) // caches the tokens + LastAuthUser
  writePref(kind)
  active = { user, session }
  return userFromSession(session)
}

// ── sign-in (SRP) with challenges ─────────────────────────────────────────

export const NEXT_STEP = {
  DONE: 'DONE',
  CONFIRM_SIGN_UP: 'CONFIRM_SIGN_UP',
  NEW_PASSWORD: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED',
  TOTP: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE',
  SMS: 'CONFIRM_SIGN_IN_WITH_SMS_CODE',
}

// A sign-in waiting on a challenge answer. Cleared on success, failure, or
// when the login page unmounts (cancelPendingSignIn).
let pending = null

const settle = (user, kind, resolve, reject) => ({
  onSuccess: (session) => {
    pending = null
    writePref(kind)
    active = { user, session }
    resolve({ nextStep: NEXT_STEP.DONE, user: userFromSession(session) })
  },
  onFailure: (err) => {
    if (err?.code === 'UserNotConfirmedException') {
      pending = null
      resolve({ nextStep: NEXT_STEP.CONFIRM_SIGN_UP })
      return
    }
    reject(err)
  },
  newPasswordRequired: () => {
    pending = { user, kind, step: NEXT_STEP.NEW_PASSWORD }
    resolve({ nextStep: NEXT_STEP.NEW_PASSWORD })
  },
  mfaRequired: () => {
    pending = { user, kind, step: NEXT_STEP.SMS }
    resolve({ nextStep: NEXT_STEP.SMS })
  },
  totpRequired: () => {
    pending = { user, kind, step: NEXT_STEP.TOTP }
    resolve({ nextStep: NEXT_STEP.TOTP })
  },
  mfaSetup: () => reject(Object.assign(new Error('MFA setup required'), { code: 'MFASetupRequired' })),
  selectMFAType: () => reject(Object.assign(new Error('MFA type selection required'), { code: 'MFASetupRequired' })),
  customChallenge: () => reject(Object.assign(new Error('Unsupported challenge'), { code: 'UnsupportedChallenge' })),
})

/**
 * Password sign-in. `username` is whatever identifies the account: the
 * username, the verified email, or the verified phone in E.164.
 * @returns {Promise<{nextStep: string, user?: object}>}
 */
export const signIn = ({ username, password, remember = true }) => new Promise((resolve, reject) => {
  const kind = remember ? 'local' : 'session'
  // Clear any session in the other storage so exactly one exists.
  signOut()
  const id = username.trim()
  const user = new CognitoUser({ Username: id, Pool: poolFor(kind) })
  // Default flow is USER_SRP_AUTH: only an SRP proof leaves the browser.
  user.authenticateUser(new AuthenticationDetails({ Username: id, Password: password }),
    settle(user, kind, resolve, reject))
})

/** Answer the pending challenge: { newPassword } or { code }. */
export const confirmSignIn = ({ newPassword, code }) => new Promise((resolve, reject) => {
  if (!pending) {
    reject(Object.assign(new Error('Sign-in expired'), { code: 'NoPendingSignIn' }))
    return
  }
  const { user, kind, step } = pending
  const handlers = settle(user, kind, resolve, reject)
  if (step === NEXT_STEP.NEW_PASSWORD) user.completeNewPasswordChallenge(newPassword, {}, handlers)
  else user.sendMFACode(code, handlers, step === NEXT_STEP.TOTP ? 'SOFTWARE_TOKEN_MFA' : undefined)
})

let pendingCode = null // { phone, session } while a texted code is outstanding

export const cancelPendingSignIn = () => {
  pending = null
  pendingCode = null
}

// ── sign-in with a texted code (passwordless) ─────────────────────────────

const api = () => {
  if (!isCognitoConfigured()) throw Object.assign(new Error('Sign-in is not configured.'), { code: 'NotConfigured' })
  return createCognitoApi({ region: REGION, clientId: CLIENT_ID })
}

/** Text a sign-in code to the account's verified phone (E.164). */
export const startCodeSignIn = async (phone) => {
  const { session, destination } = await api().startSmsSignIn(phone)
  pendingCode = { phone, session }
  return { destination }
}

export const confirmCodeSignIn = async ({ code, remember = true }) => {
  if (!pendingCode) throw Object.assign(new Error('Sign-in expired'), { code: 'NoPendingSignIn' })
  const tokens = await api().answerSmsCode({ ...pendingCode, code })
  pendingCode = null
  return { nextStep: NEXT_STEP.DONE, user: adoptTokens(tokens, remember ? 'local' : 'session') }
}

// ── social sign-in (Google / Facebook through Cognito) ─────────────────────

const OAUTH_KEY = 'sankatai_oauth'
const redirectUri = () => `${window.location.origin}/auth/callback`
const sha256 = async (text) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)))

/** Providers to offer on the sign-in pages (none until configured). */
export const socialProviders = () => (isCognitoConfigured() && OAUTH_DOMAIN ? SOCIAL : [])

/**
 * Leave for the provider. Only ever called from a button press. The PKCE
 * verifier and state live in sessionStorage for the round trip only.
 */
export const startSocialSignIn = async (provider, { returnTo = null, remember = true, retried = false } = {}) => {
  if (!socialProviders().includes(provider)) throw Object.assign(new Error('Unavailable'), { code: 'NotConfigured' })
  const random = (bytes) => randomUrlSafe((a) => crypto.getRandomValues(a), bytes)
  const verifier = random(48)
  const state = random(24)
  sessionStorage.setItem(OAUTH_KEY, JSON.stringify({ provider, verifier, state, returnTo, remember, retried }))
  const codeChallenge = await pkceChallenge(verifier, sha256)
  window.location.assign(buildAuthorizeUrl({
    domain: OAUTH_DOMAIN, clientId: CLIENT_ID, redirectUri: redirectUri(), provider, state, codeChallenge,
  }))
}

/**
 * Finish on /auth/callback. Resolves { user, returnTo }, or { restarted: true }
 * when Cognito asks for a second attempt right after linking an account.
 */
export const completeSocialSignIn = async (search) => {
  const params = new URLSearchParams(search)
  let saved = null
  try { saved = JSON.parse(sessionStorage.getItem(OAUTH_KEY) || 'null') } catch { saved = null }
  sessionStorage.removeItem(OAUTH_KEY)
  const error = params.get('error_description') || params.get('error')
  if (error) {
    if (saved && !saved.retried && isLinkedAccountRetry(error)) {
      await startSocialSignIn(saved.provider, { returnTo: saved.returnTo, remember: saved.remember, retried: true })
      return { restarted: true }
    }
    throw Object.assign(new Error(error), { code: /PreSignUp failed/i.test(error) ? 'UserLambdaValidationException' : 'SocialSignInFailed' })
  }
  if (!saved || !params.get('code') || params.get('state') !== saved.state) {
    throw Object.assign(new Error('State mismatch'), { code: 'SocialSignInFailed' })
  }
  const tokens = await exchangeAuthCode({
    domain: OAUTH_DOMAIN, clientId: CLIENT_ID, redirectUri: redirectUri(), code: params.get('code'), codeVerifier: saved.verifier,
  })
  return { user: adoptTokens(tokens, saved.remember ? 'local' : 'session'), returnTo: saved.returnTo }
}

// ── sign-up / verification / password reset ──────────────────────────────

const plainUser = (username) => new CognitoUser({ Username: username.trim(), Pool: poolFor('session') })

/**
 * Create an account with an email or a phone number. The Cognito username is
 * a fresh UUID (never shown); the person signs in with their chosen username,
 * email or phone.
 *
 * The chosen username travels as ClientMetadata, not as an attribute: Cognito
 * refuses preferred_username on an unconfirmed account when it is an alias.
 * The pre sign-up trigger checks it; the post confirmation trigger sets it.
 * @returns {Promise<{username: string}>} the Cognito username, needed to confirm.
 */
export const signUp = async ({ email, phone, password, name, username }) => {
  const cognitoUsername = crypto.randomUUID()
  const attributes = []
  if (email) attributes.push(new CognitoUserAttribute({ Name: 'email', Value: email.trim().toLowerCase() }))
  if (phone) attributes.push(new CognitoUserAttribute({ Name: 'phone_number', Value: phone }))
  if (name?.trim()) attributes.push(new CognitoUserAttribute({ Name: 'name', Value: name.trim() }))
  const metadata = { preferred_username: normalizeUsername(username) }
  await callback((cb) => poolFor('session').signUp(cognitoUsername, password, attributes, null, cb, metadata))
  return { username: cognitoUsername }
}

/**
 * Confirm with the code sent to the new email/phone (by Cognito username).
 * `handle` is the chosen username, set by the post confirmation trigger.
 * ForceAliasCreation stays false, so an email/phone another account has
 * verified is never moved to this one (AliasExistsException instead).
 */
export const confirmSignUp = (username, code, handle) => callback((cb) => plainUser(username).confirmRegistration(
  code.trim(), false, cb, handle ? { preferred_username: normalizeUsername(handle) } : undefined,
))

export const resendSignUpCode = (username) => callback((cb) => plainUser(username).resendConfirmationCode(cb))

/** Start a reset for a username, verified email or verified phone. */
export const resetPassword = (identifier) => new Promise((resolve, reject) => {
  plainUser(identifier).forgotPassword({
    onSuccess: resolve,
    onFailure: reject,
    inputVerificationCode: (data) => resolve(data),
  })
})

export const confirmResetPassword = (identifier, code, newPassword) => new Promise((resolve, reject) => {
  plainUser(identifier).confirmPassword(code.trim(), newPassword, { onSuccess: resolve, onFailure: reject })
})

/**
 * Change the signed-in user's password. Cognito checks the current password
 * itself (ChangePassword takes it and the access token). SRP-only: no
 * USER_PASSWORD_AUTH re-authentication.
 */
export const changePassword = async (_email, currentPassword, newPassword) => {
  if (!active) throw Object.assign(new Error('Sign in again to change your password.'), { code: 'NoSession' })
  try {
    return await callback((cb) => active.user.changePassword(currentPassword, newPassword, cb))
  } catch (err) {
    throw new Error(err?.code === 'NotAuthorizedException' ? 'Your current password is incorrect.' : (err?.message || 'Could not change your password.'))
  }
}

/**
 * Set or change the signed-in person's username (preferred_username). Cognito
 * rejects one that is already taken (AliasExistsException). Resolves the user
 * with fresh claims.
 */
export const updateUsername = async (username) => {
  if (!active) throw Object.assign(new Error('Sign in again to change your username.'), { code: 'NoSession' })
  const attribute = new CognitoUserAttribute({ Name: 'preferred_username', Value: normalizeUsername(username) })
  await callback((cb) => active.user.updateAttributes([attribute], cb))
  return refreshSession()
}
