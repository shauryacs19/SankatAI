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
