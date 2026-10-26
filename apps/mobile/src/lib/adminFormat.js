// Formatting + date-range helpers for the admin console (same rules as web
// features/admin/format.js). Days are bucketed in IST on the backend.
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

export const toRange = ({ preset, from, to }, now = Date.now()) => {
  const today = analyticsToday(now)
  if (preset === 'today') return { from: today, to: today, granularity: 'hour' }
  if (preset === '7d') return { from: shift(today, -6), to: today, granularity: 'day' }
  if (preset === 'custom' && from && to) return { from, to, granularity: from === to ? 'hour' : 'day' }
  return { from: shift(today, -29), to: today, granularity: 'day' }
}

const DAY = /^\d{4}-\d{2}-\d{2}$/
export const validateCustom = (from, to, now = Date.now()) => {
  if (!from || !to) return 'Choose a start and an end date.'
  if (!DAY.test(from) || !DAY.test(to)) return 'Use the YYYY-MM-DD format.'
  if (from > to) return 'The start date must be on or before the end date.'
  if (to > analyticsToday(now)) return 'The end date can’t be in the future.'
  const days = (new Date(`${to}T00:00:00Z`) - new Date(`${from}T00:00:00Z`)) / 86400000
  if (days > 365) return 'Choose a range of at most 366 days.'
  return ''
}

const nf = (n) => { try { return n.toLocaleString('en-IN') } catch { return String(n) } }
export const fmt = (n) => (typeof n === 'number' ? nf(n) : '—')
export const fmtMs = (ms) => (typeof ms !== 'number' ? '—' : ms >= 1000 ? `${(ms / 1000).toFixed(1)} s` : `${ms} ms`)
export const fmtPct = (n) => (typeof n === 'number' ? `${n}%` : '—')

export const labelFor = (t) => {
  if (!t) return ''
  if (t.length === 13) return `${t.slice(11, 13)}:00`
  const d = new Date(`${t}T00:00:00Z`)
  return `${d.getUTCDate()} ${['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'][d.getUTCMonth()]}`
}

export const fmtTime = (iso) => {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  try { return d.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) } catch { return d.toISOString().replace('T', ' ').slice(0, 16) }
}

// Categorical series colours (validated on web: dataviz palette, light + dark).
export const SERIES = { light: ['#2a78d6', '#eb6834', '#1baf7a'], dark: ['#3987e5', '#d95926', '#199e70'] }

export const hasPoints = (...seriesValues) => seriesValues.some((values) => values.some((v) => v != null))
