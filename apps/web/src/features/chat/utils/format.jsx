// Pure formatting helpers and emergency constants shared across the dashboard
// pages. (Navigation config moved to DashboardLayout; severity presentation to
// components/ui/severity.js.)

import { Siren, Shield, Flame, Ambulance } from 'lucide-react'

export const formatBold = (text) => {
  if (!text) return null
  return text.split('**').map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

// Age from date of birth — the shared helper, so web and mobile agree.
export { ageFromDob } from '@sankatai/shared'

export const parseAnalysis = (raw) => { try { return JSON.parse(raw) } catch { return null } }

export const normalizeAssistant = (content) => {
  const p = parseAnalysis(content)
  if (!p) return { text: content, severity: null, riskScore: null }
  if (p.followUpQuestions?.length) return { text: p.followUpQuestions.join(' '), severity: null, riskScore: null }
  if (p.severity) return { text: p.advice || '', severity: p.severity, riskScore: typeof p.riskScore === 'number' ? Math.round(p.riskScore) : null }
  return { text: p.advice || content, severity: null, riskScore: null }
}

export const toBubble = (m) => {
  // User messages loaded from history are persisted -> delivered ("received").
  if (m.role === 'user') return { id: m.id, sender: 'user', text: m.content, createdAt: m.createdAt, status: 'received', attachmentIds: m.attachmentIds || [] }
  const n = normalizeAssistant(m.content)
  return { id: m.id, sender: 'bot', text: n.text, severity: n.severity, riskScore: n.riskScore, raw: m.content, createdAt: m.createdAt, feedback: m.feedback ?? null, offline: Boolean(m.isOfflineFallback) }
}

export const relTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso); const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 60) return 'just now'
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`
  return d.toLocaleDateString()
}

// Re-exported from @sankatai/shared so both clients format timestamps identically.
export { fmtTime } from '@sankatai/shared'

export const EMERGENCY_NUMBERS = [
  { label: 'Ambulance', number: '108', Icon: Ambulance },
  { label: 'Emergency (All)', number: '112', Icon: Siren },
  { label: 'Police', number: '100', Icon: Shield },
  { label: 'Fire', number: '101', Icon: Flame },
]

export const groupConsults = (list) => {
  const now = new Date()
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  const yestStart = new Date(todayStart); yestStart.setDate(yestStart.getDate() - 1)
  const groups = { Today: [], Yesterday: [], Earlier: [] }
  list.forEach((c) => {
    const t = c.updatedAt ? new Date(c.updatedAt) : null
    if (t && t >= todayStart) groups.Today.push(c)
    else if (t && t >= yestStart) groups.Yesterday.push(c)
    else groups.Earlier.push(c)
  })
  return Object.entries(groups).filter(([, arr]) => arr.length)
}
