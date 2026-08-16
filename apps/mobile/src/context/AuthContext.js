// Single source of truth for authentication state.
//
//   INITIALIZING -> restore + (refresh if needed) tokens from secure storage
//   AUTHENTICATED / UNAUTHENTICATED -> drives which navigator is shown
//
// Screens never touch tokens or reset navigation for auth; they call signIn /
// signOut here and the navigator switches automatically (no login flicker).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { initAuth, signIn as cognitoSignIn, signOut as cognitoSignOut, onSignOut } from '../lib/cognito'
import { getProfile } from '../lib/api'

const AuthContext = createContext(null)

export const AUTH_STATUS = { INITIALIZING: 'initializing', AUTHENTICATED: 'authenticated', UNAUTHENTICATED: 'unauthenticated' }

// Where to land once authenticated: existing profile -> App, empty -> setup.
// On a network/timeout error we default to App (not setup) so a slow profile
// call can't force an existing user through onboarding again.
//
// `signOutOn401: false` is critical here: this probe runs *during* sign-in, right
// after the session is minted. If the profile endpoint answers 401 (clock skew,
// a transient reject, JWKS warm-up), the default API behaviour would sign the
// user straight back out — the session gets torn down mid-login and the app never
// settles on the authenticated stack. The route probe must never revert auth.
async function resolveInitialRoute() {
  try { return (await getProfile({ signOutOn401: false })) ? 'App' : 'ProfileSetup' }
  catch { return 'App' }
}

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(AUTH_STATUS.INITIALIZING)
  const [initialRoute, setInitialRoute] = useState('App')
  const mounted = useRef(true)

  useEffect(() => () => { mounted.current = false }, [])

  useEffect(() => {
    (async () => {
      const session = await initAuth()
      if (!mounted.current) return
      if (session) {
        setInitialRoute(await resolveInitialRoute())
        if (mounted.current) setStatus(AUTH_STATUS.AUTHENTICATED)
      } else {
        setStatus(AUTH_STATUS.UNAUTHENTICATED)
      }
    })()
  }, [])

  // Out-of-band sign-out (refresh failure / hard 401 in the API client).
  useEffect(() => onSignOut(() => { if (mounted.current) setStatus(AUTH_STATUS.UNAUTHENTICATED) }), [])

  const signIn = useCallback(async (email, password) => {
    await cognitoSignIn(email, password)
    setInitialRoute(await resolveInitialRoute())
    setStatus(AUTH_STATUS.AUTHENTICATED)
  }, [])

  const signOut = useCallback(async () => {
    await cognitoSignOut()
    setStatus(AUTH_STATUS.UNAUTHENTICATED)
  }, [])

  const value = useMemo(() => ({ status, initialRoute, signIn, signOut }), [status, initialRoute, signIn, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
