// Install secure random-number support before importing Cognito. Cognito's SRP
// authentication needs crypto.getRandomValues on React Native.
import 'react-native-get-random-values'

// Cognito auth for React Native.
//
// Token lifecycle is AWS Cognito's own: sign-in yields id/access/refresh tokens;
// the refresh token mints new ones. We keep a synchronous in-memory cache for
// fast reads and persist tokens to the platform secure keystore (iOS Keychain /
// Android Keystore via expo-secure-store) — never AsyncStorage/localStorage/plain files.
//
// Ways in: password (username, email or phone — all Cognito aliases) or a
// texted one-time code (Cognito USER_AUTH / SMS_OTP).

import * as SecureStore from 'expo-secure-store'
import {
  CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js'
import { createCognitoApi, normalizeUsername, uuidV4 } from '@sankatai/shared'
import { COGNITO } from '../config'

// Individual SecureStore entries (each token stays well under the 2KB limit).
const K = {
  username: 'sankatai_username', // the Cognito username (a UUID)
  idToken: 'sankatai_idToken',
  accessToken: 'sankatai_accessToken',
  refreshToken: 'sankatai_refreshToken',
  expiresAt: 'sankatai_expiresAt',
}
// Refresh a little before actual expiry to avoid racing a just-expired token.
const EXPIRY_SKEW_MS = 60_000

// --- synchronous in-memory storage for the Cognito SDK itself ---
class MemoryStorage {
  constructor() { this.data = {} }
  setItem(k, v) { this.data[k] = v; return v }
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.data, k) ? this.data[k] : null }
  removeItem(k) { delete this.data[k] }
  clear() { this.data = {} }
}
const memoryStore = new MemoryStorage()

const userPool = new CognitoUserPool({
  UserPoolId: COGNITO.userPoolId,
  ClientId: COGNITO.clientId,
  Storage: memoryStore,
})

const api = () => createCognitoApi({ region: COGNITO.region, clientId: COGNITO.clientId })

// --- in-memory session cache (synchronous reads) ---
let currentSession = null
let refreshInFlight = null

// Notify the app (AuthContext) when the session is cleared out-of-band, e.g. a
// refresh failure or a hard 401 inside the API client, so nav returns to sign-in.
const signOutListeners = new Set()
export const onSignOut = (fn) => { signOutListeners.add(fn); return () => signOutListeners.delete(fn) }
const emitSignOut = () => { signOutListeners.forEach((fn) => { try { fn() } catch { /* ignore */ } }) }

const isExpired = (s, skew = 0) => !s || !s.expiresAt || Date.now() >= s.expiresAt - skew

// Display-only JWT claims (the backend verifies tokens, not this).
const claimsOf = (jwt) => {
  try {
    const part = String(jwt).split('.')[1].replace(/-/g, '+').replace(/_/g, '/')
    const raw = atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='))
    let text = raw
    try { text = decodeURIComponent(escape(raw)) } catch { /* ASCII-only fallback */ }
    return JSON.parse(text)
  } catch {
    return {}
  }
}

async function writeSecure(data) {
  // SecureStore is the durable source of truth. Keep the in-memory cache only
  // after every required keystore write succeeds; do not silently downgrade to
  // insecure/in-memory-only persistence.
  if (!data?.idToken || !data?.refreshToken || !data?.expiresAt) {
    throw new Error('Cognito did not return a complete authentication session.')
  }
  await Promise.all([
    SecureStore.setItemAsync(K.username, data.username || ''),
    SecureStore.setItemAsync(K.idToken, data.idToken),
    SecureStore.setItemAsync(K.accessToken, data.accessToken || ''),
    SecureStore.setItemAsync(K.refreshToken, data.refreshToken),
    SecureStore.setItemAsync(K.expiresAt, String(data.expiresAt)),
  ])
  currentSession = data
}

async function clearSecure() {
  currentSession = null
  await Promise.allSettled([...Object.values(K), 'sankatai_email'].map((k) => SecureStore.deleteItemAsync(k)))
  memoryStore.clear()
  emitSignOut()
}

function sessionToData(session, existingRefreshToken = null) {
  const accessToken = session.getAccessToken().getJwtToken()
  return {
    username: claimsOf(accessToken).username,
    idToken: session.getIdToken().getJwtToken(),
    accessToken,
    refreshToken: session.getRefreshToken?.()?.getToken?.() || existingRefreshToken,
    expiresAt: session.getIdToken().getExpiration() * 1000,
  }
}

// Tokens from the texted-code flow (not the SDK).
function tokensToData(tokens) {
  return {
    username: claimsOf(tokens.accessToken).username,
    idToken: tokens.idToken,
    accessToken: tokens.accessToken,
    refreshToken: tokens.refreshToken,
    expiresAt: (claimsOf(tokens.idToken).exp || 0) * 1000,
  }
}

// Restore tokens from the keystore at startup. If the ID token is stale but a
// refresh token exists, silently refresh so the user stays signed in.
export async function initAuth() {
  try {
    const [username, idToken, accessToken, refreshToken, expiresAt] = await Promise.all([
      SecureStore.getItemAsync(K.username),
      SecureStore.getItemAsync(K.idToken),
      SecureStore.getItemAsync(K.accessToken),
      SecureStore.getItemAsync(K.refreshToken),
      SecureStore.getItemAsync(K.expiresAt),
    ])
    if (!refreshToken) { currentSession = null; return null }
    currentSession = { username, idToken, accessToken, refreshToken, expiresAt: Number(expiresAt) || 0 }
    if (isExpired(currentSession, EXPIRY_SKEW_MS)) {
      const token = await refreshSession()
      return token ? currentSession : null
    }
    return currentSession
  } catch {
    currentSession = null
    return null
  }
}

// Exchange the stored refresh token for fresh id/access tokens. Concurrent
// callers share a single in-flight refresh. Returns the new ID token or null.
export function refreshSession() {
  if (refreshInFlight) return refreshInFlight
  const refreshToken = currentSession?.refreshToken
  const username = currentSession?.username
  if (!refreshToken) return Promise.resolve(null)

  refreshInFlight = new Promise((resolve) => {
    const user = new CognitoUser({ Username: username || 'user', Pool: userPool, Storage: memoryStore })
    user.refreshSession(new CognitoRefreshToken({ RefreshToken: refreshToken }), async (err, session) => {
      if (err || !session) {
        await clearSecure()
        resolve(null)
        return
      }
      // Cognito may not re-issue a refresh token; keep the existing one.
      const data = sessionToData(session, refreshToken)
      try {
        await writeSecure(data)
        resolve(data.idToken)
      } catch {
        await clearSecure()
        resolve(null)
      }
    })
  }).finally(() => { refreshInFlight = null })

  return refreshInFlight
}

export const isCognitoConfigured = () => Boolean(COGNITO.userPoolId && COGNITO.clientId)
export const getStoredSession = () => currentSession
export const isAuthenticated = () => Boolean(currentSession?.idToken && currentSession?.refreshToken)

/** Who is signed in, from the ID token (display only). */
export const getCurrentAccount = () => {
  const c = claimsOf(currentSession?.idToken)
  return {
    email: c.email || null,
    phone: c.phone_number || null,
    username: c.preferred_username || null,
  }
}
export const getCurrentEmail = () => getCurrentAccount().email

// Async token for API calls: refreshes first if the ID token is expired/near-expiry.
export async function getValidIdToken() {
  if (!currentSession?.refreshToken) return null
  if (currentSession.idToken && !isExpired(currentSession, EXPIRY_SKEW_MS)) return currentSession.idToken
  return refreshSession()
}

// ── sign-up ─────────────────────────────────────────────────────────────────

/**
 * Create an account with an email or a phone (E.164). The Cognito username is
 * a fresh UUID; people sign in with their chosen username, email or phone.
 * The chosen username goes as ClientMetadata (Cognito refuses
 * preferred_username on an unconfirmed account when it is an alias); the pool's
 * triggers check it at sign-up and set it on confirmation.
 * @returns {Promise<{username: string}>} the Cognito username, needed to confirm.
 */
export const signUp = ({ username, email, phone, name, password }) =>
  new Promise((resolve, reject) => {
    const cognitoUsername = uuidV4((a) => crypto.getRandomValues(a))
    const attrs = []
    if (email) attrs.push(new CognitoUserAttribute({ Name: 'email', Value: email.trim().toLowerCase() }))
    if (phone) attrs.push(new CognitoUserAttribute({ Name: 'phone_number', Value: phone }))
    if (name?.trim()) attrs.push(new CognitoUserAttribute({ Name: 'name', Value: name.trim() }))
    const metadata = { preferred_username: normalizeUsername(username) }
    userPool.signUp(cognitoUsername, password, attrs, null, (err) => (err ? reject(err) : resolve({ username: cognitoUsername })), metadata)
  })

// ForceAliasCreation stays false: an email/phone another account has verified
// is never moved to this one.
export const confirmSignUp = (cognitoUsername, code, handle) =>
  new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: cognitoUsername, Pool: userPool, Storage: memoryStore })
    const metadata = handle ? { preferred_username: normalizeUsername(handle) } : undefined
    user.confirmRegistration(code, false, (err, res) => (err ? reject(err) : resolve(res)), metadata)
  })

export const resendConfirmationCode = (cognitoUsername) =>
  new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: cognitoUsername, Pool: userPool, Storage: memoryStore })
    user.resendConfirmationCode((err, res) => (err ? reject(err) : resolve(res)))
  })

// ── password sign-in ────────────────────────────────────────────────────────

/** `identifier`: username, verified email, or verified phone (E.164). */
export const signIn = (identifier, password) =>
  new Promise((resolve, reject) => {
    const details = new AuthenticationDetails({ Username: identifier, Password: password })
    const onSuccess = async (session) => {
      try {
        await writeSecure(sessionToData(session))
        resolve(session)
      } catch (err) {
        await clearSecure()
        reject(err)
      }
    }
    const attempt = (flow, onFailure) => {
      const user = new CognitoUser({ Username: identifier, Pool: userPool, Storage: memoryStore })
      user.setAuthenticationFlowType(flow)
      // Provide every callback so the promise always settles (a challenge the app
      // doesn't support otherwise leaves the SDK — and the sign-in button — hanging).
      user.authenticateUser(details, {
        onSuccess,
        onFailure,
        newPasswordRequired: () => onFailure(new Error('A new password is required. Please sign in on the website to set it first.')),
        mfaRequired: () => onFailure(new Error('Multi-factor auth is not supported in the app yet.')),
        totpRequired: () => onFailure(new Error('Multi-factor auth is not supported in the app yet.')),
        mfaSetup: () => onFailure(new Error('Multi-factor setup is required. Please complete it on the website.')),
      })
    }
    // Prefer USER_PASSWORD_AUTH: it skips the slow in-JS SRP big-integer math, so
    // mobile sign-in is near-instant like the web (which runs SRP on native crypto).
    // Fall back to SRP only if the Cognito app client doesn't permit password auth.
    attempt('USER_PASSWORD_AUTH', (err) => {
      const notEnabled = err?.code === 'InvalidParameterException' && /USER_PASSWORD_AUTH/i.test(err?.message || '')
      if (notEnabled) attempt('USER_SRP_AUTH', reject)
      else reject(err)
    })
  })

// ── texted-code sign-in (passwordless) ──────────────────────────────────────

let pendingCode = null // { phone, session }

/** Text a sign-in code to the account's verified phone (E.164). */
export const startCodeSignIn = async (phone) => {
  const { session, destination } = await api().startSmsSignIn(phone)
  pendingCode = { phone, session }
  return { destination }
}

export const confirmCodeSignIn = async (code) => {
  if (!pendingCode) throw new Error('That sign-in expired. Request a new code.')
  const tokens = await api().answerSmsCode({ ...pendingCode, code })
  pendingCode = null
  await writeSecure(tokensToData(tokens))
}

export const cancelCodeSignIn = () => { pendingCode = null }

// ── account ─────────────────────────────────────────────────────────────────

export const signOut = async () => {
  const user = userPool.getCurrentUser()
  if (user) user.signOut()
  pendingCode = null
  await clearSecure()
}

/**
 * Set or change the username (preferred_username). Cognito rejects a taken one
 * with AliasExistsException. Refreshes tokens so the new name shows at once.
 */
export async function updateUsername(username) {
  if (!currentSession?.accessToken) throw new Error('Sign in again to change your username.')
  await api().updateAttributes({ accessToken: currentSession.accessToken, attributes: { preferred_username: normalizeUsername(username) } })
  await refreshSession()
  return getCurrentAccount()
}

// Change the account password. Re-authenticates with the current password first
// (the SDK storage is in-memory), then calls Cognito's changePassword. The
// stored keystore tokens and the app session are left untouched.
export const changePassword = (currentPassword, newPassword) =>
  new Promise((resolve, reject) => {
    const username = currentSession?.username
    if (!username) { reject(new Error('Sign in again to change your password.')); return }
    const user = new CognitoUser({ Username: username, Pool: userPool, Storage: memoryStore })
    const details = new AuthenticationDetails({ Username: username, Password: currentPassword })
    user.setAuthenticationFlowType('USER_PASSWORD_AUTH')
    user.authenticateUser(details, {
      onSuccess: () => {
        user.changePassword(currentPassword, newPassword, (err, res) => {
          if (err) reject(new Error(err.message || 'Could not change your password.'))
          else resolve(res)
        })
      },
      onFailure: (err) => reject(new Error(
        err?.code === 'NotAuthorizedException' ? 'Your current password is incorrect.' : (err?.message || 'Could not change your password.'),
      )),
      newPasswordRequired: () => reject(new Error('Please sign in on the website to set a new password first.')),
      mfaRequired: () => reject(new Error('Multi-factor auth is not supported in the app yet.')),
      totpRequired: () => reject(new Error('Multi-factor auth is not supported in the app yet.')),
      mfaSetup: () => reject(new Error('Multi-factor setup is required. Please complete it on the website.')),
    })
  })
