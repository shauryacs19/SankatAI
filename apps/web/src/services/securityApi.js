// Account-level security PINs. Values are never returned by the backend — only
// { id, label, createdAt }. The backend derives the user from the Cognito token.

import { request } from './api/httpClient'

export const listPins = () => request('/security/pins')
export const createPin = ({ pin, label }) => request('/security/pins', { method: 'POST', body: { pin, label: label || null } })
// Deleting a PIN requires the PIN itself (backend verifies it).
export const deletePin = (id, pin) => request(`/security/pins/${id}`, { method: 'DELETE', body: { pin } })
