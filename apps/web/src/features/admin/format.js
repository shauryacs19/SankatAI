// Formatting + date-range helpers for the admin console.

// Days are bucketed in IST on the backend (ANALYTICS_UTC_OFFSET_MINUTES=330).
const OFFSET_MINUTES = 330

export const analyticsToday = (now = Date.now()) => new Date(now + OFFSET_MINUTES * 60000).toISOString().slice(0, 10)

const shift = (day, delta) => {
  const d = new Date(`${day}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + delta)
  return d.toISOString().slice(0, 10)
}

export const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: '7d', label: '7 days' },
  { value: '30d', label: '30 days' },
  { value: 'custom', label: 'Custom' },
]

/** {preset, from, to} -> the query the API takes. */
export const toRange = ({ preset, from, to }, now = Date.now()) => {
  const today = analyticsToday(now)
  if (preset === 'today') return { from: today, to: today, granularity: 'hour' }
  if (preset === '7d') return { from: shift(today, -6), to: today, granularity: 'day' }
  if (preset === 'custom' && from && to) {
    return { from, to, granularity: from === to ? 'hour' : 'day' }
  }
  return { from: shift(today, -29), to: today, granularity: 'day' }
}

export const validateCustom = (from, to, now = Date.now()) => {
  if (!from || !to) return 'Choose a start and an end date.'
  if (from > to) return 'The start date must be on or before the end date.'
  if (to > analyticsToday(now)) return 'The end date can’t be in the future.'
  const days = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000
  if (days > 365) return 'Choose a range of at most 366 days.'
  return ''
}

const nf = new Intl.NumberFormat('en-IN')
export const fmt = (n) => (typeof n === 'number' ? nf.format(n) : '—')
export const fmtMs = (ms) => (typeof ms !== 'number' ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`)
export const fmtPct = (n) => (typeof n === 'number' ? `${n}%` : '—')

/** Axis/tooltip label for a series key: 'YYYY-MM-DD' or 'YYYY-MM-DDTHH'. */
export const labelFor = (t, { long = false } = {}) => {
  if (!t) return ''
  if (t.length === 13) {
    const hour = Number(t.slice(11, 13))
    return long ? `${t.slice(0, 10)} ${String(hour).padStart(2, '0')}:00 IST` : `${String(hour).padStart(2, '0')}:00`
  }
  const d = new Date(`${t}T00:00:00Z`)
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(long ? { year: 'numeric' } : {}), timeZone: 'UTC' })
}

export const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })
}

// Categorical series slots (validated: dataviz validate_palette, light + dark).
export const SERIES = ['var(--viz-1)', 'var(--viz-2)', 'var(--viz-3)']
// Triage severity is status, drawn in the app's fixed severity fills.
export const SEVERITY_COLORS = {
  EMERGENCY: 'var(--sev-emergency)', HIGH: 'var(--sev-high)', MODERATE: 'var(--sev-moderate)', LOW: 'var(--sev-low)',
}

/** True when any series has at least one recorded (non-null) point. */
export const hasPoints = (...seriesValues) => seriesValues.some((values) => values.some((v) => v != null))
