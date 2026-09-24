// Turns a caught error into words a person can act on. Network failures from
// fetch() surface as "Failed to fetch" / "Load failed" — never show those raw.
export const isNetworkError = (err) =>
  (typeof navigator !== 'undefined' && navigator.onLine === false) ||
  /failed to fetch|networkerror|load failed|network request failed/i.test(String(err?.message || ''))

export const errText = (err, fallback = 'Something went wrong. Please try again.') => {
  if (isNetworkError(err)) return "We couldn't reach SankatAI. Check your connection and try again."
  const msg = String(err?.message || '').trim()
  return msg || fallback
}
