// Cognito auth for the web app, via amazon-cognito-identity-js (the library the
// app already ships). Cognito stays the IdP; sign-in is the in-app form using
// SRP, so the password is never sent to Cognito in clear or to our backend.
// There is NO Hosted UI redirect anywhere: loading a page only reads the
// library's stored session (refreshing it if needed), silently.
//
// Token storage is the library's default: localStorage when "Remember me" is
// on, sessionStorage (this tab only) when it is off. This app never writes
// tokens or roles itself. Admin decisions are made by the backend from the
// verified JWT; the claims read here are for display only.

import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserAttribute,
  CognitoUserPool,
} from 'amazon-cognito-identity-js'

const POOL_ID = import.meta.env.VITE_COGNITO_USER_POOL_ID
const CLIENT_ID = import.meta.env.VITE_COGNITO_CLIENT_ID

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
    name: claims.name || null,
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
 * @returns {Promise<{nextStep: string, user?: object}>}
 */
export const signIn = ({ username, password, remember = true }) => new Promise((resolve, reject) => {
  const kind = remember ? 'local' : 'session'
  // Clear any session in the other storage so exactly one exists.
  signOut()
  const user = new CognitoUser({ Username: username.trim().toLowerCase(), Pool: poolFor(kind) })
  // Default flow is USER_SRP_AUTH: only an SRP proof leaves the browser.
  user.authenticateUser(new AuthenticationDetails({ Username: username.trim().toLowerCase(), Password: password }),
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

export const cancelPendingSignIn = () => { pending = null }

// ── sign-up / verification / password reset ──────────────────────────────

const plainUser = (email) => new CognitoUser({ Username: email.trim().toLowerCase(), Pool: poolFor('session') })

export const signUp = ({ email, password, name }) => {
  const attributes = [new CognitoUserAttribute({ Name: 'email', Value: email.trim().toLowerCase() })]
  if (name?.trim()) attributes.push(new CognitoUserAttribute({ Name: 'name', Value: name.trim() }))
  return callback((cb) => poolFor('session').signUp(email.trim().toLowerCase(), password, attributes, null, cb))
}

export const confirmSignUp = (email, code) => callback((cb) => plainUser(email).confirmRegistration(code.trim(), true, cb))

export const resendSignUpCode = (email) => callback((cb) => plainUser(email).resendConfirmationCode(cb))

export const resetPassword = (email) => new Promise((resolve, reject) => {
  plainUser(email).forgotPassword({
    onSuccess: resolve,
    onFailure: reject,
    inputVerificationCode: (data) => resolve(data),
  })
})

export const confirmResetPassword = (email, code, newPassword) => new Promise((resolve, reject) => {
  plainUser(email).confirmPassword(code.trim(), newPassword, { onSuccess: resolve, onFailure: reject })
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
