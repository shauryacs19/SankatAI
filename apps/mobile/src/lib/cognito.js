// Install secure random-number support before importing Cognito. Cognito's SRP
// authentication needs crypto.getRandomValues on React Native.
import 'react-native-get-random-values'

// Cognito auth for React Native.
//
// Token lifecycle is AWS Cognito's own: sign-in yields id/access/refresh tokens;
// the ID token (1h) is what the backend verifies; the refresh token mints new
// ones. We keep a synchronous in-memory cache for fast reads and persist tokens
// to the platform secure keystore (iOS Keychain / Android Keystore via
// expo-secure-store) — never AsyncStorage/localStorage/plain files.

import * as SecureStore from 'expo-secure-store'
import {
  CognitoUserPool, CognitoUser, AuthenticationDetails, CognitoUserAttribute,
  CognitoRefreshToken,
} from 'amazon-cognito-identity-js'
import { COGNITO } from '../config'

// Individual SecureStore entries (each token stays well under the 2KB limit).
const K = {
  email: 'sankatai_email',
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

// --- in-memory session cache (synchronous reads) ---
let currentSession = null
let refreshInFlight = null

// Notify the app (AuthContext) when the session is cleared out-of-band, e.g. a
// refresh failure or a hard 401 inside the API client, so nav returns to sign-in.
const signOutListeners = new Set()
export const onSignOut = (fn) => { signOutListeners.add(fn); return () => signOutListeners.delete(fn) }
const emitSignOut = () => { signOutListeners.forEach((fn) => { try { fn() } catch { /* ignore */ } }) }

const isExpired = (s, skew = 0) => !s || !s.expiresAt || Date.now() >= s.expiresAt - skew

async function writeSecure(data) {
  // SecureStore is the durable source of truth. Keep the in-memory cache only
  // after every required keystore write succeeds; do not silently downgrade to
  // insecure/in-memory-only persistence.
  if (!data?.idToken || !data?.refreshToken || !data?.expiresAt) {
    throw new Error('Cognito did not return a complete authentication session.')
  }
  await Promise.all([
    SecureStore.setItemAsync(K.email, data.email || ''),
    SecureStore.setItemAsync(K.idToken, data.idToken),
    SecureStore.setItemAsync(K.accessToken, data.accessToken || ''),
    SecureStore.setItemAsync(K.refreshToken, data.refreshToken),
    SecureStore.setItemAsync(K.expiresAt, String(data.expiresAt)),
  ])
  currentSession = data
}

async function clearSecure() {
  currentSession = null
  await Promise.allSettled(Object.values(K).map((k) => SecureStore.deleteItemAsync(k)))
  memoryStore.clear()
  emitSignOut()
}

function sessionToData(session, email, existingRefreshToken = null) {
  const refreshToken = session.getRefreshToken?.()?.getToken?.() || existingRefreshToken
  return {
    email,
    idToken: session.getIdToken().getJwtToken(),
    accessToken: session.getAccessToken().getJwtToken(),
    refreshToken,
    expiresAt: session.getIdToken().getExpiration() * 1000,
  }
}

// Restore tokens from the keystore at startup. If the ID token is stale but a
// refresh token exists, silently refresh so the user stays signed in.
export async function initAuth() {
  try {
    const [email, idToken, accessToken, refreshToken, expiresAt] = await Promise.all([
      SecureStore.getItemAsync(K.email),
      SecureStore.getItemAsync(K.idToken),
      SecureStore.getItemAsync(K.accessToken),
      SecureStore.getItemAsync(K.refreshToken),
      SecureStore.getItemAsync(K.expiresAt),
    ])
    if (!refreshToken) { currentSession = null; return null }
    currentSession = { email, idToken, accessToken, refreshToken, expiresAt: Number(expiresAt) || 0 }
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
  const email = currentSession?.email
  if (!refreshToken) return Promise.resolve(null)

  refreshInFlight = new Promise((resolve) => {
    const user = new CognitoUser({ Username: email || 'user', Pool: userPool, Storage: memoryStore })
    user.refreshSession(new CognitoRefreshToken({ RefreshToken: refreshToken }), async (err, session) => {
      if (err || !session) {
        await clearSecure()
        resolve(null)
        return
      }
      // Cognito may not re-issue a refresh token; keep the existing one.
      const data = sessionToData(session, email, refreshToken)
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
export const getCurrentEmail = () => currentSession?.email || null
export const isAuthenticated = () => Boolean(currentSession?.idToken && currentSession?.refreshToken)

// Async token for API calls: refreshes first if the ID token is expired/near-expiry.
export async function getValidIdToken() {
  if (!currentSession?.refreshToken) return null
  if (currentSession.idToken && !isExpired(currentSession, EXPIRY_SKEW_MS)) return currentSession.idToken
  return refreshSession()
}

export const signUp = (email, password) =>
  new Promise((resolve, reject) => {
    const attrs = [new CognitoUserAttribute({ Name: 'email', Value: email })]
    userPool.signUp(email, password, attrs, null, (err, res) => (err ? reject(err) : resolve(res)))
  })

export const confirmSignUp = (email, code) =>
  new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool, Storage: memoryStore })
    user.confirmRegistration(code, true, (err, res) => (err ? reject(err) : resolve(res)))
  })

export const resendConfirmationCode = (email) =>
  new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool, Storage: memoryStore })
    user.resendConfirmationCode((err, res) => (err ? reject(err) : resolve(res)))
  })

export const signIn = (email, password) =>
  new Promise((resolve, reject) => {
    const details = new AuthenticationDetails({ Username: email, Password: password })
    const onSuccess = async (session) => {
      try {
        await writeSecure(sessionToData(session, email))
        resolve(session)
      } catch (err) {
        await clearSecure()
        reject(err)
      }
    }
    const attempt = (flow, onFailure) => {
      const user = new CognitoUser({ Username: email, Pool: userPool, Storage: memoryStore })
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

export const signOut = async () => {
  const user = userPool.getCurrentUser()
  if (user) user.signOut()
  await clearSecure()
}

// Change the account password. Re-authenticates with the current password first
// (the SDK storage is in-memory), then calls Cognito's changePassword. The
// stored keystore tokens and the app session are left untouched.
export const changePassword = (email, currentPassword, newPassword) =>
  new Promise((resolve, reject) => {
    const user = new CognitoUser({ Username: email, Pool: userPool, Storage: memoryStore })
    const details = new AuthenticationDetails({ Username: email, Password: currentPassword })
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
