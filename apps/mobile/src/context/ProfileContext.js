import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { isAuthenticated } from '../lib/cognito'
import { getProfile } from '../lib/api'

const ProfileContext = createContext(null)

export const isProfileComplete = (p) => Boolean(p)

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(false)

  const refresh = useCallback(async (opts = {}) => {
    if (!isAuthenticated()) { setProfile(null); return null }
    setLoading(true)
    try {
      const data = await getProfile(opts)
      setProfile(data || null)
      return data || null
    } catch {
      setProfile(null)
      return null
    } finally {
      setLoading(false)
    }
  }, [])

  // First load fires right after sign-in flips to AUTHENTICATED (JWKS cache still
  // cold). signOutOn401:false so a transient 401 on this initial read can't sign
  // the just-authenticated user straight back out. User-driven refreshes keep the
  // default (true) so a real mid-session expiry is still caught.
  useEffect(() => { if (isAuthenticated()) refresh({ signOutOn401: false }) }, [refresh])

  return (
    <ProfileContext.Provider value={{ profile, loading, refresh, setProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
