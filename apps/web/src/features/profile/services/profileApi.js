// Profile HTTP calls.

import { request } from '../../../services/api/httpClient'

export const getProfile = () => request('/profile')
export const saveProfile = (profile) => request('/profile', { method: 'PUT', body: profile })
