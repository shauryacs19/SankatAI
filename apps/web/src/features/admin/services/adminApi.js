// Admin console API. Every call is authorised by the backend (API Gateway JWT
// authorizer + JWT re-verification + ADMIN group + active admins row); nothing
// here decides access. Responses are aggregates only — never patient data.
import { request } from '../../../services/api/httpClient'

const query = ({ from, to, granularity }) => new URLSearchParams({ from, to, granularity }).toString()

export const getAnalytics = (range) => request(`/admin/analytics?${query(range)}`)
export const exportAnalyticsCsv = (range) => request(`/admin/analytics?${query(range)}&format=csv`, { responseType: 'text' })
export const getUserAggregates = (range) => request(`/admin/users?${query(range)}`)
export const getFeedback = (range) => request(`/admin/feedback?${query(range)}`)
export const getSystemHealth = () => request('/admin/system-health')

export const listAdmins = () => request('/admin/admins')
export const removeAdmin = (sub, { confirmSelf = false } = {}) =>
  request(`/admin/admins/${encodeURIComponent(sub)}${confirmSelf ? '?confirm_self=true' : ''}`, { method: 'DELETE' })

export const listInvitations = () => request('/admin/invitations')
export const createInvitation = (email) => request('/admin/invitations', { method: 'POST', body: { email } })
export const revokeInvitation = (id) => request(`/admin/invitations/${encodeURIComponent(id)}`, { method: 'DELETE' })
// Not admin-gated: this is how an invited user becomes an admin.
export const acceptInvitation = (token, idToken) =>
  request('/admin/invitations/accept', { method: 'POST', body: { token, idToken } })

export const getAuditLogs = (cursor) => request(`/admin/audit-logs?limit=50${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`)
