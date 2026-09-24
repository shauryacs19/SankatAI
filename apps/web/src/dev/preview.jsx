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

import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MemoryRouter } from 'react-router-dom'
import { MotionConfig } from 'framer-motion'
import { App } from '../app/App.jsx'
import { AuthContext, AUTH_STATUS } from '../context/AuthContext.jsx'
import { installStyles } from '../styles/install'
import { initTheme } from '../services/theme'

const q = new URLSearchParams(location.search)
const route = q.get('route') || (q.get('auth') === '0' ? '/' : '/dashboard/chat')
const EMPTY = q.get('empty') === '1'
const FAIL = q.get('fail') === '1'
const SLOW = Number(q.get('slow') || 0)
const OFFLINE = q.get('offline') === '1'

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
  return json(404, { detail: `No mock for ${method} ${path}` })
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
  status: signedIn ? AUTH_STATUS.AUTHENTICATED : AUTH_STATUS.UNAUTHENTICATED,
  user: signedIn ? { email: 'aarav@example.com' } : null,
  signIn: async () => { alert('Preview: sign-in would redirect to Cognito here.') },
  signOut: async () => {},
  restore: async () => {},
}

installStyles()
initTheme()

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
