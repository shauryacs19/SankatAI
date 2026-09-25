// DEV-ONLY visual preview harness. Served by the Vite dev server at
// /preview.html; it is NOT a build input (vite builds index.html only), so none
// of this ships. It renders the real app with a fake signed-in session and a
// mocked /api so every page and state can be checked without credentials.
//
// Query params:
//   route=/dashboard/files   initial route (default /dashboard/chat)
//   auth=0                   signed-out (Landing / Login)
//   empty=1                  empty lists (no chats, files, pins, contacts)
//   fail=1                   every API call fails (network error)
//   slow=2000                delay every API call by N ms
//   offline=1                AI replies are offline fallbacks; /api/health 503
//   noprofile=1              profile loads as null (onboarding)
//   static=1                 skip framer animations (stable screenshots for QA)
//   admin=1                  signed-in user is in the ADMIN group; /api/admin/* mocked
//                            (e.g. ?admin=1&route=/admin). QA fixtures only — the real
//                            console reads the backend's aggregates.

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { MotionConfig, MotionGlobalConfig } from 'framer-motion'
import { App } from '../app/App.jsx'
import { AuthContext, AUTH_STATUS } from '../context/AuthContext.jsx'
import { installStyles } from '../styles/install'
import { initTheme } from '../services/theme'
import { installQa, installContrast } from './qa'

const q = new URLSearchParams(location.search)
const route = q.get('route') || (q.get('auth') === '0' ? '/' : '/dashboard/chat')
const EMPTY = q.get('empty') === '1'
const FAIL = q.get('fail') === '1'
const SLOW = Number(q.get('slow') || 0)
const OFFLINE = q.get('offline') === '1'
const ADMIN = q.get('admin') === '1'

const now = Date.now()
const iso = (msAgo) => new Date(now - msAgo).toISOString()
const H = 3600e3
const D = 24 * H

const profile = q.get('noprofile') === '1' ? null : {
  firstName: 'Aarav', lastName: 'Sharma', dob: '1990-04-12', gender: 'Male', phone: '+91 98765 43210',
  email: 'aarav@example.com', bloodGroup: 'B+', preferredLanguage: 'Hindi',
  allergies: 'Penicillin', conditions: '', disability: '',
  emergencyContacts: EMPTY ? [] : [{ name: 'Priya Sharma', relationship: 'Spouse', phone: '+91 91234 56789' }],
  fileCategories: EMPTY ? [] : ['Prescriptions', 'Lab reports', 'Insurance'],
}

const ai = (o) => JSON.stringify(o)
let consultations = EMPTY ? [] : [
  { consultationId: 'c1', title: 'Chest pain and breathlessness', updatedAt: iso(0.3 * H), lastSeverity: 'EMERGENCY' },
  { consultationId: 'c2', title: 'Fever for two days', updatedAt: iso(0.8 * D), lastSeverity: 'MODERATE' },
  { consultationId: 'c3', title: 'Sprained ankle while running', updatedAt: iso(5 * D), lastSeverity: 'LOW' },
  { consultationId: 'c4', title: 'Severe migraine with vomiting', updatedAt: iso(9 * D), lastSeverity: 'HIGH' },
]
const messages = {
  c1: [
    { id: 'm1', role: 'user', content: 'I have chest pain spreading to my left arm and I am short of breath.', createdAt: iso(0.35 * H), attachmentIds: [] },
    { id: 'm2', role: 'assistant', content: ai({ severity: 'EMERGENCY', riskScore: 95, advice: 'These symptoms can be a sign of a **heart attack**. Stop any activity and sit down. Do not drive yourself to hospital.', reasoning: 'Chest pain radiating to the left arm with breathlessness is a classic cardiac warning pattern.', disclaimer: 'This is not a diagnosis.' }), createdAt: iso(0.34 * H), feedback: null },
    { id: 'm3', role: 'user', content: 'It started about 20 minutes ago.', createdAt: iso(0.32 * H), attachmentIds: [] },
    { id: 'm4', role: 'assistant', content: ai({ severity: 'MODERATE', riskScore: 48, advice: 'Keyword estimate: chest discomfort detected. Seek medical care promptly.' }), createdAt: iso(0.31 * H), isOfflineFallback: true },
  ],
  c2: [
    { id: 'm5', role: 'user', content: 'High fever and headache for 2 days.', createdAt: iso(0.8 * D), attachmentIds: [] },
    { id: 'm6', role: 'assistant', content: ai({ followUpQuestions: ['How high has your temperature been?', 'Do you have a stiff neck or a rash?'] }), createdAt: iso(0.8 * D) },
  ],
  c3: [], c4: [],
}
let vault = EMPTY ? [] : [
  { attachmentId: 'f1', filename: 'CBC report — March.pdf', contentType: 'application/pdf', size: 245000, createdAt: iso(3 * D), category: 'Lab reports', kind: 'document', passwordProtected: true, pinId: 'p1' },
  { attachmentId: 'f2', filename: 'Prescription Dr Mehta.jpg', contentType: 'image/jpeg', size: 1800000, createdAt: iso(10 * D), category: 'Prescriptions', kind: 'photo', passwordProtected: false },
  { attachmentId: 'f3', filename: 'Discharge summary 2023 with a deliberately long file name that needs truncating.pdf', contentType: 'application/pdf', size: 88000, createdAt: iso(40 * D), category: null, kind: 'document', passwordProtected: false },
]
let pins = EMPTY ? [] : [{ id: 'p1', label: 'Personal', createdAt: iso(20 * D) }]

const json = (status, body) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
const wait = (ms) => new Promise((r) => setTimeout(r, ms))

const route_ = async (method, path, body) => {
  if (path.startsWith('/api/health')) return OFFLINE ? json(503, { status: 'degraded' }) : json(200, { status: 'ok' })
  if (path === '/api/profile' && method === 'GET') return json(200, profile)
  if (path === '/api/profile' && method === 'PUT') return json(200, body)
  if (path.startsWith('/api/consultations')) {
    const m = path.match(/^\/api\/consultations(?:\/([^/?]+))?(?:\/messages(?:\/([^/]+))?(\/feedback)?)?(\?.*)?$/)
    const [, cid, mid, fb, qs] = m || []
    if (!cid && method === 'GET') {
      const term = new URLSearchParams((qs || '').slice(1)).get('q')
      return json(200, term ? consultations.filter((c) => c.title.toLowerCase().includes(term.toLowerCase())) : consultations)
    }
    if (!cid && method === 'POST') { const c = { consultationId: `c${Date.now()}`, title: 'New consultation', updatedAt: new Date().toISOString() }; consultations = [c, ...consultations]; messages[c.consultationId] = []; return json(200, c) }
    if (cid && !path.includes('/messages') && method === 'DELETE') { consultations = consultations.filter((c) => c.consultationId !== cid); return json(204) }
    if (cid && !path.includes('/messages') && method === 'PATCH') return json(200, { consultationId: cid, title: body.title })
    if (fb) return json(200, {})
    if (mid && method === 'DELETE') return json(204)
    if (path.endsWith('/messages') && method === 'GET') return json(200, messages[cid] || [])
    if (path.endsWith('/messages') && method === 'POST') {
      await wait(1400)
      const t = new Date().toISOString()
      return json(200, {
        userMessage: { id: `u${Date.now()}`, role: 'user', content: body.content, createdAt: t },
        assistantMessage: { id: `a${Date.now()}`, role: 'assistant', createdAt: t, isOfflineFallback: OFFLINE, content: ai({ severity: 'HIGH', riskScore: 72, advice: 'Please see a doctor **today**. If symptoms get worse, call 108.' }) },
        isOfflineFallback: OFFLINE,
      })
    }
  }
  if (path.startsWith('/api/uploads')) {
    if (path.startsWith('/api/uploads?')) return json(200, path.includes('scope=chat') ? [] : vault)
    if (path === '/api/uploads/presign') return json(200, { attachmentId: `f${Date.now()}`, uploadUrl: '/__mock_s3' })
    if (path.endsWith('/complete')) return json(200, {})
    if (path.endsWith('/download')) return body?.pin && body.pin !== '123456' ? json(403, { detail: 'Incorrect PIN.' }) : json(200, { downloadUrl: 'about:blank' })
    const id = path.split('/')[3]
    if (method === 'DELETE') { vault = vault.filter((f) => f.attachmentId !== id); return json(204) }
    if (method === 'PATCH') return json(200, { ...vault.find((f) => f.attachmentId === id), ...body })
  }
  if (path.startsWith('/api/security/pins')) {
    if (method === 'GET') return json(200, pins)
    if (method === 'POST') { const p = { id: `p${Date.now()}`, label: body.label || 'PIN', createdAt: new Date().toISOString() }; pins = [...pins, p]; return json(200, p) }
    if (method === 'DELETE') { if (body?.pin !== '123456') return json(403, { detail: 'Incorrect PIN.' }); pins = pins.filter((p) => !path.endsWith(p.id)); return json(204) }
  }
  if (ADMIN && path.startsWith('/api/admin')) return adminRoute(method, path, body)
  return json(404, { detail: `No mock for ${method} ${path}` })
}

// --- admin console fixtures (dev harness only) -------------------------------
const m = (value) => ({ value, unavailable: null })
const na = (reason) => ({ value: null, unavailable: reason })
function adminAnalytics(path) {
  const u = new URLSearchParams(path.split('?')[1] || '')
  const hourly = u.get('granularity') === 'hour'
  const n = hourly ? 24 : 30
  const labels = Array.from({ length: n }, (_, i) => (hourly
    ? `${u.get('from')}T${String(i).padStart(2, '0')}`
    : new Date(now - (n - 1 - i) * D).toISOString().slice(0, 10)))
  const wave = (i, base, amp) => (EMPTY ? 0 : Math.max(0, Math.round(base + amp * Math.sin(i / 3))))
  const tracked = (i) => i >= (hourly ? 0 : 6) // live tracking began 6 days into the window
  const series = (fn) => labels.map((t, i) => ({ t, ...fn(i) }))
  return {
    range: { from: labels[0].slice(0, 10), to: labels[n - 1].slice(0, 10), granularity: hourly ? 'hour' : 'day', labels },
    users: {
      total: m(1284), newInRange: m(96), totalRegistered: m(1210), activeNow: m(7), dau: m(58), wau: m(212), mau: m(640), activeInRange: m(655),
      series: series((i) => ({ new: wave(i, 3, 2), active: hourly || !tracked(i) ? null : wave(i, 50, 12) })),
    },
    ai: {
      requests: m(1432), responses: m(1390), failed: m(42), successRate: m(97.1), avgLatencyMs: m(1830), totalResponses: m(18204), responsesToday: m(61),
      byInputType: { text: m(1180), voice: m(252), image: na('The AI does not analyse images; attachments are stored, not sent to the model.') },
      series: series((i) => ({ requests: wave(i, 48, 14), responses: wave(i, 46, 13), failed: wave(i, 2, 2) })),
    },
    feedback: { up: m(212), down: m(31), ratio: m(87.2), series: series((i) => ({ up: wave(i, 7, 3), down: wave(i, 1, 1) })) },
    triage: {
      total: m(1390), emergency: m(38),
      bySeverity: { EMERGENCY: m(38), HIGH: m(171), MODERATE: m(512), LOW: m(669) },
      series: series((i) => ({ EMERGENCY: wave(i, 1, 1), HIGH: wave(i, 6, 2), MODERATE: wave(i, 17, 5), LOW: wave(i, 22, 6) })),
    },
    activity: {
      documentsUploaded: m(88), chatAttachments: m(143), conversationsStarted: m(402), conversationsTotal: m(5120), activeConversations: m(377),
      series: series((i) => ({ conversations: wave(i, 13, 4), vault: wave(i, 3, 2), chat: wave(i, 5, 3) })),
    },
    api: { requests: m(40211), errors4xx: m(512), errors5xx: m(9), avgLatencyMs: m(212) },
    kpis: {
      totalUsers: m(1284), activeUsers: m(7), aiResponses: m(1390), emergencyCases: m(38), upvotes: m(212), downvotes: m(31),
      apiErrors: m(9), avgResponseMs: m(1830),
    },
  }
}
let adminInvites = [
  { id: 'a'.repeat(32), email: 'new.doctor@gmail.com', status: 'pending', createdAt: iso(3 * H), expiresAt: iso(-45 * H), emailStatus: 'sent' },
  { id: 'b'.repeat(32), email: 'old@gmail.com', status: 'expired', createdAt: iso(5 * D), expiresAt: iso(3 * D), emailStatus: 'sent' },
]
function adminRoute(method, path, body) {
  const p = path.replace('/api/admin', '')
  if (p.startsWith('/analytics') || p.startsWith('/users') || p.startsWith('/feedback')) return json(200, adminAnalytics(p))
  if (p === '/system-health') {
    const at = new Date().toISOString()
    return json(200, {
      checks: [
        { name: 'backend', status: 'healthy', latencyMs: 0, checkedAt: at, detail: 'this response' },
        { name: 'dynamodb', status: 'healthy', latencyMs: 18, checkedAt: at, detail: null },
        { name: 's3', status: 'healthy', latencyMs: 42, checkedAt: at, detail: null },
        { name: 'cognito', status: 'healthy', latencyMs: 61, checkedAt: at, detail: null },
        { name: 'ai_provider', status: 'degraded', latencyMs: 1, checkedAt: at, detail: 'no API key (answers use the offline keyword engine)' },
        { name: 'api_gateway', status: 'unavailable', latencyMs: 3, checkedAt: at, detail: 'API_GATEWAY_ID not configured' },
      ],
      apiGatewayLastHour: null,
      recentFailures: [{ name: 'ai_provider', status: 'degraded', detail: 'no API key', at }],
      cachedForSeconds: 60, generatedAt: at,
    })
  }
  if (p === '/admins') return json(200, { activeCount: 2, admins: [
    { sub: 'sub-self', email: 'aarav@example.com', status: 'active', isSelf: true, grantedAt: iso(30 * D), grantedVia: 'bootstrap' },
    { sub: 'sub-2', email: 'priya@gmail.com', status: 'active', isSelf: false, grantedAt: iso(4 * D), grantedVia: 'invitation:x' },
  ] })
  if (p.startsWith('/admins/')) return json(200, { status: 'revoked', cognitoCleanup: 'done', self: false })
  if (p === '/invitations' && method === 'GET') return json(200, { invitations: adminInvites })
  if (p === '/invitations' && method === 'POST') {
    const inv = { id: `${Date.now()}`.padEnd(32, '0'), email: body.email, status: 'pending', createdAt: new Date().toISOString(), expiresAt: iso(-48 * H), emailStatus: 'sent' }
    adminInvites = [inv, ...adminInvites]
    return json(201, inv)
  }
  if (p.startsWith('/invitations/') && method === 'DELETE') {
    adminInvites = adminInvites.map((i) => (p.endsWith(i.id) ? { ...i, status: 'revoked' } : i))
    return json(200, {})
  }
  if (p.startsWith('/audit-logs')) {
    const actions = ['analytics_view', 'invite_create', 'health_view', 'access_denied', 'admin_remove', 'export']
    return json(200, {
      items: actions.map((action, i) => ({
        ts: iso(i * 37 * 60e3), adminSub: i === 3 ? 'c0ffee00-user-0000-0000-000000000003' : 'a1b2c3d4-admin-0000-0000-000000000001',
        action, resource: action === 'invite_create' ? 'invitation:aaaa invitee:ne***@gmail.com' : 'range:2026-08-27..2026-09-25/day',
        result: i === 3 ? 'denied' : 'success', reason: i === 3 ? 'not_in_admin_group' : null,
        ip: '203.0.113.7', userAgent: 'Mozilla/5.0', requestId: `req-${1000 + i}`,
      })),
      nextCursor: null,
    })
  }
  return json(404, { detail: `No admin mock for ${method} ${path}` })
}

const realFetch = window.fetch.bind(window)
window.fetch = async (input, init = {}) => {
  const url = typeof input === 'string' ? input : input.url
  const path = url.replace(location.origin, '')
  if (!path.startsWith('/api') && path !== '/__mock_s3') return realFetch(input, init)
  if (SLOW) await wait(SLOW)
  if (FAIL) throw new TypeError('Failed to fetch')
  if (path === '/__mock_s3') { await wait(800); return new Response(null, { status: 200 }) }
  const method = (init.method || 'GET').toUpperCase()
  const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : undefined
  return route_(method, path, body)
}

const signedIn = q.get('auth') !== '0'
const auth = {
  status: signedIn ? AUTH_STATUS.AUTHED : AUTH_STATUS.GUEST,
  user: signedIn ? { userId: 'sub-self', email: 'aarav@example.com', groups: ADMIN ? ['ADMIN'] : [] } : null,
  signIn: async () => { alert('Preview: sign-in calls Cognito (SRP) here.'); return { nextStep: 'DONE' } },
  confirmSignIn: async () => ({ nextStep: 'DONE' }),
  signOut: async () => {},
  restore: async () => {},
  refreshUser: async () => ({ userId: 'sub-self', email: 'aarav@example.com', groups: ['ADMIN'] }),
}

if (q.get('static') === '1') MotionGlobalConfig.skipAnimations = true

installStyles()
initTheme()
installQa()
installContrast()

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <MotionConfig reducedMotion="user">
      <AuthContext.Provider value={auth}>
        <MemoryRouter initialEntries={[route]}>
          <App />
        </MemoryRouter>
      </AuthContext.Provider>
    </MotionConfig>
  </StrictMode>,
)
