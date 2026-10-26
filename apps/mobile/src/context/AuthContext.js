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
import { isProfileComplete } from '@sankatai/shared'

const AuthContext = createContext(null)

export const AUTH_STATUS = { INITIALIZING: 'initializing', AUTHENTICATED: 'authenticated', UNAUTHENTICATED: 'unauthenticated' }

export function AuthProvider({ children }) {
  const [status, setStatus] = useState(AUTH_STATUS.INITIALIZING)
  const [initialRoute, setInitialRoute] = useState('ProfileCheck')
  const [profileSnapshot, setProfileSnapshot] = useState(null)
  const [profileCheckComplete, setProfileCheckComplete] = useState(false)
  const [profileCheckError, setProfileCheckError] = useState('')
  const mounted = useRef(true)

  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])

  // Fail closed: never send a user past onboarding until the profile check has
  // succeeded. A transient API error gets a retry screen rather than silently
  // treating an unknown profile as complete.
  const checkProfile = useCallback(async () => {
    if (mounted.current) {
      setProfileCheckComplete(false)
      setProfileCheckError('')
    }
    try {
      const profile = await getProfile({ signOutOn401: false })
      const route = isProfileComplete(profile) ? 'App' : 'ProfileSetup'
      if (mounted.current) {
        setProfileSnapshot(profile || null)
        setInitialRoute(route)
        setProfileCheckComplete(true)
      }
      return route
    } catch (error) {
      if (mounted.current) {
        setProfileSnapshot(null)
        setInitialRoute('ProfileCheck')
        setProfileCheckError(/network request failed|network error|failed to fetch|timed out/i.test(String(error?.message || ''))
          ? 'We couldn’t reach the profile service. Check your connection and try again.'
          : error?.message || 'We couldn’t verify your health profile. Please try again.')
      }
      return null
    }
  }, [])

  useEffect(() => {
    (async () => {
      const session = await initAuth()
      if (!mounted.current) return
      if (session) {
        await checkProfile()
        if (mounted.current) setStatus(AUTH_STATUS.AUTHENTICATED)
      } else {
        setStatus(AUTH_STATUS.UNAUTHENTICATED)
      }
    })()
  }, [checkProfile])

  // Out-of-band sign-out (refresh failure / hard 401 in the API client).
  useEffect(() => onSignOut(() => {
    if (!mounted.current) return
    setProfileSnapshot(null)
    setProfileCheckComplete(false)
    setProfileCheckError('')
    setStatus(AUTH_STATUS.UNAUTHENTICATED)
  }), [])

  // Password sign-in. `identifier`: username, email or phone (E.164).
  const signIn = useCallback(async (identifier, password) => {
    await cognitoSignIn(identifier, password)
    await checkProfile()
    setStatus(AUTH_STATUS.AUTHENTICATED)
  }, [checkProfile])

  // After a texted-code sign-in has stored its tokens.
  const finishSignIn = useCallback(async () => {
    await checkProfile()
    setStatus(AUTH_STATUS.AUTHENTICATED)
  }, [checkProfile])

  const retryProfileCheck = useCallback(() => checkProfile(), [checkProfile])

  const signOut = useCallback(async () => {
    await cognitoSignOut()
    setProfileSnapshot(null)
    setProfileCheckComplete(false)
    setProfileCheckError('')
    setInitialRoute('ProfileCheck')
    setStatus(AUTH_STATUS.UNAUTHENTICATED)
  }, [])

  const value = useMemo(() => ({
    status, initialRoute, profileSnapshot, profileCheckComplete, profileCheckError,
    signIn, finishSignIn, retryProfileCheck, signOut,
  }), [status, initialRoute, profileSnapshot, profileCheckComplete, profileCheckError, signIn, finishSignIn, retryProfileCheck, signOut])
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
