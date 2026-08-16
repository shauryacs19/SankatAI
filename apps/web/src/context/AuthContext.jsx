import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import {
  handleRedirectCallback,
  restoreSession,
  signIn as hostedSignIn,
  signOut as hostedSignOut,
} from '../services/auth/cognito'

const AuthContext = createContext(null)

export const AUTH_STATUS = {
  INITIALIZING: 'initializing',
  AUTHENTICATED: 'authenticated',
  UNAUTHENTICATED: 'unauthenticated',
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(AUTH_STATUS.INITIALIZING)
  const [user, setUser] = useState(null)

  // StrictMode double-invokes effects in development. The authorization code is
  // single-use, so a second exchange would fail — guard the whole bootstrap.
  const bootstrapped = useRef(false)

  const restore = useCallback(async () => {
    try {
      // 1. Returning from the Hosted UI with ?code= — exchange it for tokens.
      const callback = await handleRedirectCallback()
      if (callback?.user) {
        setUser(callback.user)
        setStatus(AUTH_STATUS.AUTHENTICATED)
        if (callback.returnTo && callback.returnTo !== window.location.pathname) {
          window.history.replaceState({}, '', callback.returnTo)
        }
        return
      }

      // 2. Plain page load. Tokens are memory-only, so this bounces through
      //    Cognito's Hosted UI session cookie — no prompt if it is still valid.
      const result = await restoreSession()
      if (result === 'restoring') return // redirect in flight; keep the splash up
      if (result && result !== 'anonymous') {
        setUser(result)
        setStatus(AUTH_STATUS.AUTHENTICATED)
        return
      }
      setUser(null)
      setStatus(AUTH_STATUS.UNAUTHENTICATED)
    } catch {
      setUser(null)
      setStatus(AUTH_STATUS.UNAUTHENTICATED)
    }
  }, [])

  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true
    restore()
  }, [restore])

  useEffect(() => {
    const handleExpired = () => {
      setUser(null)
      setStatus(AUTH_STATUS.UNAUTHENTICATED)
    }
    window.addEventListener('sankatai:auth-expired', handleExpired)
    return () => window.removeEventListener('sankatai:auth-expired', handleExpired)
  }, [])

  // Full-page redirect to the Hosted UI. Nothing after this runs.
  const signIn = useCallback(async () => {
    await hostedSignIn()
  }, [])

  // Federated sign-out: also clears the Cognito session cookie, so a later
  // reload does not silently sign the user back in.
  const signOut = useCallback(async () => {
    setUser(null)
    setStatus(AUTH_STATUS.UNAUTHENTICATED)
    await hostedSignOut()
  }, [])

  const value = useMemo(
    () => ({ status, user, signIn, signOut, restore }),
    [status, user, signIn, signOut, restore],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
