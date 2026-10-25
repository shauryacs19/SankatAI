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

const strings = (v) => (Array.isArray(v) ? v.filter((s) => typeof s === 'string' && s.trim()) : [])

// The structured parts of an assessment (triage engine v2). Older replies have
// none of these and render exactly as before.
export const assessmentDetails = (p) => {
  if (!p) return null
  const d = {
    seekCare: typeof p.seekCare === 'string' ? p.seekCare : '',
    homeCare: strings(p.homeCare),
    warningSigns: strings(p.warningSigns),
    likelyCauses: strings(p.likelyCauses),
    reasoning: typeof p.reasoning === 'string' ? p.reasoning : '',
    safetyNote: typeof p.safetyNote === 'string' ? p.safetyNote : '',
    confidence: typeof p.confidence === 'number' ? p.confidence : null,
  }
  const any = d.seekCare || d.homeCare.length || d.warningSigns.length || d.likelyCauses.length || d.safetyNote
  return p.triage && any ? d : null
}

// A follow-up questionnaire: the AI's questions, each with an id, a short label,
// a kind (yes_no | choice | text) and options (none for text). Malformed items
// are dropped.
const questionnaireOf = (p) => {
  const items = Array.isArray(p.questionnaire) ? p.questionnaire.filter((it) => it && typeof it.id === 'string'
    && typeof it.question === 'string' && Array.isArray(it.options) && (it.kind === 'text' || it.options.length)) : []
  return items.length ? items : null
}

// What the assessment is about, for the nearby hospitals / clinics search.
const careOf = (p) => (p.care && typeof p.care.specialty === 'string'
  ? { specialty: p.care.specialty, issue: typeof p.care.issue === 'string' ? p.care.issue : '' } : null)

export const normalizeAssistant = (content) => {
  const p = parseAnalysis(content)
  if (!p) return { text: content, severity: null, riskScore: null }
  const details = assessmentDetails(p)
  if (p.followUpQuestions?.length) {
    return {
      text: p.followUpQuestions.join(' '), questions: p.followUpQuestions, severity: null, riskScore: null, details,
      questionnaire: questionnaireOf(p), intro: typeof p.reasoning === 'string' ? p.reasoning : '',
    }
  }
  if (p.severity) return { text: p.advice || '', severity: p.severity, riskScore: typeof p.riskScore === 'number' ? Math.round(p.riskScore) : null, details, care: careOf(p) }
  return { text: p.advice || content, severity: null, riskScore: null, details }
}

export const toBubble = (m) => {
  // User messages loaded from history are persisted -> delivered ("received").
  if (m.role === 'user') return { id: m.id, sender: 'user', text: m.content, createdAt: m.createdAt, status: 'received', attachmentIds: m.attachmentIds || [] }
  const n = normalizeAssistant(m.content)
  return { id: m.id, sender: 'bot', text: n.text, questions: n.questions || null, questionnaire: n.questionnaire || null, intro: n.intro || '', details: n.details || null, severity: n.severity, riskScore: n.riskScore, care: n.care || null, raw: m.content, lang: m.lang || null, createdAt: m.createdAt, feedback: m.feedback ?? null, offline: Boolean(m.isOfflineFallback) }
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
