import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  confirmCodeSignIn as cognitoConfirmCodeSignIn,
  confirmSignIn as cognitoConfirmSignIn,
  NEXT_STEP,
  refreshSession,
  restoreSession,
  signIn as cognitoSignIn,
  signInWithPasskey as cognitoSignInWithPasskey,
  signOut as cognitoSignOut,
} from '../services/auth/cognito'

// Exported only so the dev-only preview harness (src/dev/) can supply a
// signed-in session without touching the real auth flow.
// eslint-disable-next-line react-refresh/only-export-components -- dev harness needs the context object
export const AuthContext = createContext(null)

// Old names kept as aliases so existing call sites read the same.
export const AUTH_STATUS = {
  LOADING: 'loading',
  AUTHED: 'authed',
  GUEST: 'guest',
  INITIALIZING: 'loading',
  AUTHENTICATED: 'authed',
  UNAUTHENTICATED: 'guest',
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(AUTH_STATUS.LOADING)
  const [user, setUser] = useState(null)
  const bootstrapped = useRef(false)

  // Silent session check: reads the library's stored session and refreshes it
  // if needed. It never navigates anywhere, so public pages load for guests.
  const restore = useCallback(async () => {
    try {
      const restored = await restoreSession()
      setUser(restored)
      setStatus(restored ? AUTH_STATUS.AUTHED : AUTH_STATUS.GUEST)
    } catch {
      setUser(null)
      setStatus(AUTH_STATUS.GUEST)
    }
  }, [])

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    restore()
  }, [restore])

  // The API client dispatches this when a 401 survives one refresh.
  useEffect(() => {
    const handleExpired = () => {
      setUser(null)
      setStatus(AUTH_STATUS.GUEST)
    }
    window.addEventListener('sankatai:auth-expired', handleExpired)
    return () => window.removeEventListener('sankatai:auth-expired', handleExpired)
  }, [])

  const finish = useCallback((result) => {
    if (result.nextStep === NEXT_STEP.DONE) {
      setUser(result.user)
      setStatus(AUTH_STATUS.AUTHED)
    }
    return result
  }, [])

  /** SRP sign-in. Resolves {nextStep}; DONE also updates the session state. */
  const signIn = useCallback(async (credentials) => finish(await cognitoSignIn(credentials)), [finish])
  const confirmSignIn = useCallback(async (answer) => finish(await cognitoConfirmSignIn(answer)), [finish])
  /** Passwordless: answer the texted code. */
  const confirmCodeSignIn = useCallback(async (answer) => finish(await cognitoConfirmCodeSignIn(answer)), [finish])

  /** Passkey sign-in (WebAuthn). */
  const signInWithPasskey = useCallback(async (opts) => finish(await cognitoSignInWithPasskey(opts)), [finish])

  /** Adopt refreshed user details (e.g. after a username change). */
  const setSignedIn = useCallback((next) => {
    setUser(next)
    setStatus(AUTH_STATUS.AUTHED)
  }, [])

  const signOut = useCallback(async () => {
    cognitoSignOut()
    setUser(null)
    setStatus(AUTH_STATUS.GUEST)
  }, [])

  /** Re-issue tokens (e.g. after being granted ADMIN) and update the user. */
  const refreshUser = useCallback(async () => {
    const next = await refreshSession()
    setUser(next)
    return next
  }, [])

  const value = useMemo(
    () => ({ status, user, signIn, confirmSignIn, confirmCodeSignIn, signInWithPasskey, setSignedIn, signOut, restore, refreshUser }),
    [status, user, signIn, confirmSignIn, confirmCodeSignIn, signInWithPasskey, setSignedIn, signOut, restore, refreshUser],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
