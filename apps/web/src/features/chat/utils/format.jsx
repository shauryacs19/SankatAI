// Pure formatting helpers, severity/emergency constants, and tiny presentational
// helpers shared across the dashboard tabs. Extracted verbatim from the
// original Dashboard component (no behavior change).

import {
  User, Siren, Shield, Flame, Ambulance, Settings, MessageSquare, FolderOpen, Clock,
} from 'lucide-react'

export const formatBold = (text) => {
  if (!text) return null
  return text.split('**').map((part, i) => (i % 2 === 1 ? <strong key={i}>{part}</strong> : part))
}

export const ageFromDob = (dob) => {
  if (!dob) return null
  const born = new Date(dob)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const m = now.getMonth() - born.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--
  return age >= 0 ? age : null
}

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
  return { id: m.id, sender: 'bot', text: n.text, severity: n.severity, riskScore: n.riskScore, raw: m.content, createdAt: m.createdAt, feedback: m.feedback ?? null }
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

// Relative "Created X ago" label for a consultation's creation timestamp.
export const createdAgo = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const diff = (Date.now() - d.getTime()) / 1000
  if (diff < 45) return 'just now'
  if (diff < 90) return 'a minute ago'
  if (diff < 3600) return `${Math.floor(diff / 60)} minutes ago`
  if (diff < 7200) return 'an hour ago'
  if (diff < 86400) return `${Math.floor(diff / 3600)} hours ago`
  if (diff < 172800) return 'yesterday'
  if (diff < 604800) return `${Math.floor(diff / 86400)} days ago`
  return d.toLocaleDateString()
}

export const SEV = {
  LOW: { label: 'Low', cls: 'low' }, MODERATE: { label: 'Moderate', cls: 'moderate' },
  HIGH: { label: 'High', cls: 'high' }, EMERGENCY: { label: 'Emergency', cls: 'emergency' },
}

export const EMERGENCY_NUMBERS = [
  { label: 'Ambulance', number: '108', Icon: Ambulance },
  { label: 'Emergency (All)', number: '112', Icon: Siren },
  { label: 'Police', number: '100', Icon: Shield },
  { label: 'Fire', number: '101', Icon: Flame },
]

// Sidebar order (Offline Mode is reachable from the header's offline badge, so it
// stays out of the rail to keep the nav short and readable for patients).
export const PAGE_LABELS = { '/dashboard/profile': 'Health Profile' }

export const TABS = [
  { key: 'chat', label: 'Chat', Icon: MessageSquare, path: '/dashboard/chat' },
  { key: 'history', label: 'History', Icon: Clock, path: '/dashboard/history' },
  { key: 'documents', label: 'File Storage', Icon: FolderOpen, path: '/dashboard/files' },
  { key: 'emergency', label: 'Emergency', Icon: Siren, path: '/dashboard/emergency' },
  { key: 'settings', label: 'Settings', Icon: Settings, path: '/dashboard/settings' },
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
