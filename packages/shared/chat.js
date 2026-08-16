// Framework-agnostic chat helpers (web + mobile).

// Filter a consultation list by a title query (case-insensitive).
export const filterConsultations = (list, query) => {
  const q = String(query || '').trim().toLowerCase()
  if (!q) return list || []
  return (list || []).filter((c) => (c.title || '').toLowerCase().includes(q))
}

// Short "HH:MM" message timestamp — shared so web and mobile format identically.
export const fmtTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

// Delivery state of a user message: 'sent' (optimistic, single tick) until the
// server echoes it back as 'received' (double tick).
export const MSG_SENT = 'sent'
export const MSG_RECEIVED = 'received'

// --- Severity presentation (shared by both clients) -------------------------
// Backend severities are LOW | MODERATE | HIGH | EMERGENCY. `title` is the card
// heading, `label` the corner pill.
export const SEV_META = {
  LOW: { title: 'LOW RISK', label: 'Low' },
  MODERATE: { title: 'MODERATE RISK', label: 'Moderate' },
  HIGH: { title: 'HIGH RISK', label: 'High' },
  EMERGENCY: { title: 'EMERGENCY', label: 'Critical' },
}
export const sevMeta = (severity) => SEV_META[severity] || { title: 'ASSESSMENT', label: '' }

export const AI_DISCLAIMER =
  'SankatAI is not a replacement for professional medical advice. In a life-threatening situation, call emergency services.'
export const EMERGENCY_CALLOUT = 'Call 108 or your local emergency number IMMEDIATELY. Do not wait.'

// Quick actions shown above the composer. `action` is resolved by each client.
export const CHAT_SUGGESTIONS = [
  { key: 'chest', label: 'Chest pain causes', prompt: 'What can cause chest pain?' },
  { key: 'breathe', label: 'Breathing exercises', prompt: 'Show me breathing exercises to calm down.' },
  { key: 'hospital', label: 'Find nearby hospital', action: 'hospital' },
]
