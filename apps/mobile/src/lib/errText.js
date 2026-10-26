// Plain-language error text (mirrors web utils/errText): never show a raw
// "Network request failed" / timeout to a patient.
export const errText = (err, fallback = 'Something went wrong. Please try again.') => {
  const msg = typeof err === 'string' ? err : err?.message
  if (!msg) return fallback
  if (/network request failed|failed to fetch|timed out|can.t reach/i.test(msg)) {
    return 'Can’t reach SankatAI right now. Check your connection and try again.'
  }
  if (/^Request failed \(\d+\)$/.test(msg)) return fallback
  return msg
}
