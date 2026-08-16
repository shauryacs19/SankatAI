import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AUTH_STATUS, useAuth } from '../../../context/AuthContext.jsx'
import { getProfile } from '../services/profileApi'

const ProfileContext = createContext(null)

// A profile "exists" once the user has saved it at least once (even partially,
// since the setup wizard allows skipping). Null means they've never set it up.
export const isProfileComplete = (p) => Boolean(p)

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const { status } = useAuth()

  const refresh = useCallback(async () => {
    if (status !== AUTH_STATUS.AUTHENTICATED) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    try {
      const data = await getProfile()
      setProfile(data || null)
    } catch {
      setProfile(null)
    } finally {
      setLoading(false)
    }
  }, [status])

  useEffect(() => {
    if (status === AUTH_STATUS.AUTHENTICATED) refresh()
    else {
      setProfile(null)
      setLoading(false)
    }
  }, [status, refresh])

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
