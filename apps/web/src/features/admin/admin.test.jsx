// @vitest-environment jsdom
// Admin console: guard, loading/error/empty states, honest "Unavailable",
// access management rules, and invitation acceptance. API + Cognito mocked.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const auth = vi.hoisted(() => ({
  restoreSession: vi.fn(), signIn: vi.fn(), confirmSignIn: vi.fn(), signOut: vi.fn(), refreshSession: vi.fn(),
  cancelPendingSignIn: vi.fn(), getValidAccessToken: vi.fn(), getIdToken: vi.fn(() => 'id-token'),
}))
vi.mock('../../services/auth/cognito', () => ({ ...auth, isCognitoConfigured: () => true, NEXT_STEP: { DONE: 'DONE' } }))
const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../../services/api/httpClient', () => api)

import AppWithAuth from '../../app/App.jsx'

const ADMIN = { userId: 'admin-sub', email: 'boss@gmail.com', groups: ['ADMIN'] }
const U = (reason) => ({ value: null, unavailable: reason })
const M = (value) => ({ value, unavailable: null })
const labels = ['2026-09-23', '2026-09-24', '2026-09-25']
const series = (row) => labels.map((t, i) => ({ t, ...row(i) }))

const ANALYTICS = {
  range: { from: labels[0], to: labels[2], granularity: 'day', labels },
  users: {
    total: M(42), newInRange: M(3), totalRegistered: M(40), activeNow: M(2), dau: M(5), wau: M(9), mau: M(20), activeInRange: M(11),
    series: series((i) => ({ new: [null, 1, 2][i], active: [null, 4, 5][i] })),
  },
  ai: {
    requests: M(7), responses: M(6), failed: M(1), successRate: M(85.7), avgLatencyMs: M(1830), totalResponses: M(99), responsesToday: M(2),
    byInputType: { text: M(5), voice: M(2), image: U('The AI does not analyse images.') },
    series: series((i) => ({ requests: [null, 3, 4][i], responses: [null, 3, 3][i], failed: [null, 0, 1][i] })),
  },
  feedback: { up: M(4), down: M(1), ratio: M(80), series: series(() => ({ up: null, down: null })) },
  triage: {
    total: M(6), emergency: M(1),
    bySeverity: { EMERGENCY: M(1), HIGH: M(2), MODERATE: M(2), LOW: M(1) },
    series: series(() => ({ EMERGENCY: null, HIGH: null, MODERATE: null, LOW: null })),
  },
  activity: {
    documentsUploaded: M(1), chatAttachments: M(0), conversationsStarted: M(2), conversationsTotal: M(30), activeConversations: M(2),
    series: series(() => ({ conversations: 0, vault: 0, chat: 0 })),
  },
  api: { requests: U('API_GATEWAY_ID is not configured.'), errors4xx: U('x'), errors5xx: U('x'), avgLatencyMs: U('x') },
  kpis: {
    totalUsers: M(42), activeUsers: M(2), aiResponses: M(6), emergencyCases: M(1), upvotes: M(4), downvotes: M(1),
    apiErrors: U('API_GATEWAY_ID is not configured.'), avgResponseMs: M(1830),
  },
}

function Probe() {
  const loc = useLocation()
  return <output data-testid="loc">{loc.pathname + loc.search}</output>
}
const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <AppWithAuth />
    <Routes><Route path="*" element={<Probe />} /></Routes>
  </MemoryRouter>,
)
const routeApi = (handlers) => api.request.mockImplementation(async (path, opts = {}) => {
  for (const [prefix, handler] of Object.entries(handlers)) {
    if (path.startsWith(prefix)) return handler(path, opts)
  }
  if (path.startsWith('/profile')) return { fullName: 'Boss' }
  return []
})

beforeEach(() => {
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.scrollTo = () => {}
  Object.values(auth).forEach((fn) => fn.mockReset?.())
  auth.getIdToken.mockReturnValue('id-token')
  auth.restoreSession.mockResolvedValue(ADMIN)
  api.request.mockReset()
})
afterEach(cleanup)

describe('admin guard', () => {
  it('shows the console to an admin', async () => {
    routeApi({ '/admin/analytics': () => ANALYTICS })
    renderAt('/admin')
    expect(await screen.findByRole('heading', { name: 'Sankat.AI Admin' })).toBeTruthy()
    for (const name of ['Overview', 'Analytics', 'Users', 'Feedback', 'System Health', 'Admin Access', 'Audit Logs']) {
      expect(screen.getByRole('link', { name })).toBeTruthy()
    }
  })

  it('hides it from a signed-in non-admin', async () => {
    auth.restoreSession.mockResolvedValue({ ...ADMIN, groups: [] })
    renderAt('/admin/analytics')
    expect(await screen.findByRole('heading', { name: 'Admin access required' })).toBeTruthy()
    expect(api.request).not.toHaveBeenCalledWith(expect.stringContaining('/admin/'), expect.anything())
  })
})

describe('overview states', () => {
  it('shows a skeleton while loading', async () => {
    api.request.mockImplementation(() => new Promise(() => {}))
    renderAt('/admin')
    await screen.findByRole('heading', { name: 'Sankat.AI Admin' })
    expect(await screen.findByLabelText('Loading')).toBeTruthy()
  })

  it('renders real values, and Unavailable (never 0) where nothing is recorded', async () => {
    routeApi({ '/admin/analytics': () => ANALYTICS })
    renderAt('/admin')
    const users = await screen.findByText('Total users')
    expect(within(users.closest('.ac-metric')).getByText('42')).toBeTruthy()
    const errors = screen.getByText('API errors (5xx)').closest('.ac-metric')
    expect(within(errors).getByText(/Unavailable/)).toBeTruthy()
    expect(within(errors).queryByText('0')).toBeNull()
    expect(screen.getByText('1.8 s')).toBeTruthy()
  })

  it('shows an empty state for a chart with nothing recorded', async () => {
    routeApi({ '/admin/analytics': () => ANALYTICS })
    renderAt('/admin')
    const feedback = (await screen.findByRole('heading', { name: 'Feedback' })).closest('section')
    expect(within(feedback).getByText('No data for this range')).toBeTruthy()
  })

  it('offers a table view with "Not recorded" for gaps', async () => {
    routeApi({ '/admin/analytics': () => ANALYTICS })
    renderAt('/admin')
    const growth = (await screen.findByRole('heading', { name: 'User growth' })).closest('section')
    fireEvent.click(within(growth).getByRole('button', { name: 'Show table' }))
    const table = within(growth).getByRole('table')
    expect(within(table).getByText('Not recorded')).toBeTruthy()
    expect(within(table).getAllByRole('row')).toHaveLength(4)
  })

  it('shows an error state with retry', async () => {
    let calls = 0
    routeApi({ '/admin/analytics': () => { calls += 1; if (calls === 1) throw Object.assign(new Error('boom'), { status: 500 }); return ANALYTICS } })
    renderAt('/admin')
    fireEvent.click(await screen.findByRole('button', { name: 'Try again' }))
    expect(await screen.findByText('Total users')).toBeTruthy()
  })

  it('explains a 403 (revoked admin) instead of retrying', async () => {
    routeApi({ '/admin/analytics': () => { throw Object.assign(new Error('Admin access required.'), { status: 403 }) } })
    renderAt('/admin')
    expect(await screen.findByText(/no longer has admin access/)).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Try again' })).toBeNull()
  })

  it('refetches when the date range changes', async () => {
    routeApi({ '/admin/analytics': () => ANALYTICS })
    renderAt('/admin')
    await screen.findByText('Total users')
    fireEvent.click(screen.getByRole('radio', { name: 'Today' }))
    await waitFor(() => expect(api.request).toHaveBeenCalledWith(expect.stringMatching(/granularity=hour/)))
  })
})

describe('admin access', () => {
  const ACCESS = {
    '/admin/admins': () => ({ activeCount: 1, admins: [{ sub: 'admin-sub', email: 'boss@gmail.com', status: 'active', isSelf: true, grantedVia: 'bootstrap' }] }),
    '/admin/invitations': (path, opts) => (opts.method === 'POST' ? { id: 'i1', email: opts.body.email } : { invitations: [] }),
  }

  it('validates the Gmail address before calling the API', async () => {
    routeApi(ACCESS)
    renderAt('/admin/access')
    const input = await screen.findByLabelText(/^Gmail address/)
    fireEvent.change(input, { target: { value: 'someone@yahoo.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    expect(await screen.findByText('Enter a Gmail address (name@gmail.com).')).toBeTruthy()
    expect(api.request).not.toHaveBeenCalledWith('/admin/invitations', expect.objectContaining({ method: 'POST' }))
    fireEvent.change(input, { target: { value: 'New@Gmail.com' } })
    fireEvent.click(screen.getByRole('button', { name: 'Send invitation' }))
    await waitFor(() => expect(api.request).toHaveBeenCalledWith('/admin/invitations', { method: 'POST', body: { email: 'new@gmail.com' } }))
  })

  it('does not let the last admin remove themselves', async () => {
    routeApi(ACCESS)
    renderAt('/admin/access')
    const leave = await screen.findByRole('button', { name: 'Leave' })
    expect(leave.getAttribute('aria-disabled')).toBe('true')
  })

  const TEAM = (canRemoveOthers, selfSub) => ({
    ...ACCESS,
    '/admin/admins': () => ({
      activeCount: 3,
      canRemoveOthers,
      admins: [
        { sub: 'root-sub', email: 'root@gmail.com', status: 'active', isRoot: true, isSelf: selfSub === 'root-sub', grantedVia: 'bootstrap' },
        { sub: 'a-sub', email: 'a@gmail.com', status: 'active', isSelf: selfSub === 'a-sub', grantedVia: 'invitation:x' },
        { sub: 'b-sub', email: 'b@gmail.com', status: 'active', isSelf: selfSub === 'b-sub', grantedVia: 'invitation:y' },
      ],
    }),
  })

  it('lets the root admin remove others but never themselves', async () => {
    routeApi(TEAM(true, 'root-sub'))
    renderAt('/admin/access')
    expect(await screen.findByText('Root')).toBeTruthy()
    expect(screen.getAllByRole('button', { name: 'Remove' })).toHaveLength(2)
    expect(screen.queryByRole('button', { name: 'Leave' })).toBeNull()
  })

  it('lets a regular admin leave but not remove anyone else', async () => {
    routeApi(TEAM(false, 'a-sub'))
    renderAt('/admin/access')
    expect(await screen.findByRole('button', { name: 'Leave' })).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Remove' })).toBeNull()
  })
})

describe('invitation acceptance', () => {
  it('accepts, refreshes tokens and opens the console', async () => {
    auth.restoreSession.mockResolvedValue({ ...ADMIN, groups: [] })
    auth.refreshSession.mockResolvedValue(ADMIN)
    routeApi({ '/admin/invitations/accept': () => ({ status: 'accepted', refreshRequired: true }), '/admin/analytics': () => ANALYTICS })
    renderAt(`/admin/invite/accept?token=${'a'.repeat(32)}.secret`)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept and open the admin console' }))
    await waitFor(() => expect(screen.getByTestId('loc').textContent).toBe('/admin'))
    expect(api.request).toHaveBeenCalledWith('/admin/invitations/accept', { method: 'POST', body: { token: `${'a'.repeat(32)}.secret`, idToken: 'id-token' } })
    expect(auth.refreshSession).toHaveBeenCalled()
  })

  it('explains a wrong account and offers to switch', async () => {
    auth.restoreSession.mockResolvedValue({ ...ADMIN, groups: [] })
    routeApi({ '/admin/invitations/accept': () => { throw Object.assign(new Error('This invitation was sent to a different email address.'), { status: 403, code: 'wrong_email' }) } })
    renderAt(`/admin/invite/accept?token=${'a'.repeat(32)}.secret`)
    fireEvent.click(await screen.findByRole('button', { name: 'Accept and open the admin console' }))
    expect(await screen.findByText(/different email address/)).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Sign in with a different account' })).toBeTruthy()
  })
})
