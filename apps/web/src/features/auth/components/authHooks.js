import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Client-side throttle: after `max` consecutive failures the submit button is
 * disabled for `seconds`. Cognito's own lockout is the real control.
 */
export function useFailureThrottle(max = 5, seconds = 30) {
  const failures = useRef(0)
  const [lockedFor, setLockedFor] = useState(0)

  useEffect(() => {
    if (lockedFor <= 0) return undefined
    const t = setTimeout(() => setLockedFor((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [lockedFor])

  const fail = useCallback(() => {
    failures.current += 1
    if (failures.current >= max) {
      failures.current = 0
      setLockedFor(seconds)
    }
  }, [max, seconds])
  const reset = useCallback(() => { failures.current = 0 }, [])
  return { locked: lockedFor > 0, lockedFor, fail, reset }
}

/** A countdown for "Resend code" (seconds remaining; 0 = ready). */
export function useCooldown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return undefined
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, setLeft]
}

// A sign-up waiting for its code: { username (Cognito UUID), destination, via }.
// Kept in sessionStorage so /verify survives a reload; the UUID is the only way
// to confirm or resend before the email/phone is verified.
const PENDING_SIGN_UP = 'sankatai_pending_signup'

export const savePendingSignUp = (pending) => {
  try { sessionStorage.setItem(PENDING_SIGN_UP, JSON.stringify(pending)) } catch { /* private mode */ }
}

export const readPendingSignUp = () => {
  try { return JSON.parse(sessionStorage.getItem(PENDING_SIGN_UP) || 'null') } catch { return null }
}

export const clearPendingSignUp = () => {
  try { sessionStorage.removeItem(PENDING_SIGN_UP) } catch { /* private mode */ }
}
