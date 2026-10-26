import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { AUTH_STATUS, useAuth } from '../../../context/AuthContext.jsx'
import { getProfile } from '../services/profileApi'
import { errText } from '../../../utils/errText'
import { isProfileComplete } from '@sankatai/shared'

const ProfileContext = createContext(null)

// Share the exact required-field gate with the native app.
export { isProfileComplete }

export function ProfileProvider({ children }) {
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('') // last load failure, so the UI can say so and retry
  const { status } = useAuth()

  const refresh = useCallback(async () => {
    if (status !== AUTH_STATUS.AUTHENTICATED) {
      setProfile(null)
      setLoading(false)
      return
    }
    setLoading(true)
    setError('')
    try {
      const data = await getProfile()
      setProfile(data || null)
    } catch (e) {
      setProfile(null)
      setError(errText(e, 'Could not load your health profile.'))
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
    <ProfileContext.Provider value={{ profile, loading, error, refresh, setProfile }}>
      {children}
    </ProfileContext.Provider>
  )
}

export function useProfile() {
  const ctx = useContext(ProfileContext)
  if (!ctx) throw new Error('useProfile must be used within ProfileProvider')
  return ctx
}
