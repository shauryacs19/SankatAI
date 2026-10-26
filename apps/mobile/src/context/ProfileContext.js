import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AUTH_STATUS, useAuth } from './AuthContext'
import { isProfileComplete } from '@sankatai/shared'
import { getProfile } from '../lib/api'

const ProfileContext = createContext(null)

export { isProfileComplete }

export function ProfileProvider({ children }) {
  const { status, profileSnapshot, profileCheckComplete } = useAuth()
  const [profile, setProfile] = useState(profileSnapshot || null)
  const [loading, setLoading] = useState(true)

  const refresh = useCallback(async (opts = {}) => {
    if (status !== AUTH_STATUS.AUTHENTICATED) { setProfile(null); return null }
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
  }, [status])

  // AuthProvider already fetched this snapshot before routing. Reuse it so the
  // setup screen is prefilled on first render and we don't race a second request.
  useEffect(() => {
    if (status !== AUTH_STATUS.AUTHENTICATED) {
      setProfile(null)
      setLoading(false)
    } else if (profileCheckComplete) {
      setProfile(profileSnapshot || null)
      setLoading(false)
    } else {
      setLoading(true)
    }
  }, [status, profileSnapshot, profileCheckComplete])

  return (
    <ProfileContext.Provider value={{ profile, loading, refresh, setProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) return { profile: null, loading: false, refresh: async () => null, setProfile: () => {} }
  return ctx
}
