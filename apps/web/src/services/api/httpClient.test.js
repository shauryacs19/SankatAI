// @vitest-environment jsdom
// 401 handling: refresh once and retry; a failed refresh clears the session.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const auth = vi.hoisted(() => ({
  getValidAccessToken: vi.fn(),
  refreshSession: vi.fn(),
  signOut: vi.fn(),
}))
vi.mock('../auth/cognito', () => auth)

import { request } from './httpClient'

const res = (status, body = {}) => ({ status, ok: status < 400, json: async () => body, text: async () => JSON.stringify(body) })

beforeEach(() => {
  auth.getValidAccessToken.mockReset().mockResolvedValueOnce('old').mockResolvedValue('new')
  auth.refreshSession.mockReset()
  auth.signOut.mockReset()
  globalThis.fetch = vi.fn()
})
afterEach(() => vi.restoreAllMocks())

describe('request', () => {
  it('refreshes once on 401 and retries with the new token', async () => {
    fetch.mockResolvedValueOnce(res(401)).mockResolvedValueOnce(res(200, { ok: true }))
    auth.refreshSession.mockResolvedValue({})
    await expect(request('/profile')).resolves.toEqual({ ok: true })
    expect(auth.refreshSession).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].headers.Authorization).toBe('Bearer old')
    expect(fetch.mock.calls[1][1].headers.Authorization).toBe('Bearer new')
  })

  it('signs out and signals expiry when the refresh fails', async () => {
    fetch.mockResolvedValueOnce(res(401))
    auth.refreshSession.mockRejectedValue(new Error('revoked'))
    const expired = vi.fn()
    window.addEventListener('sankatai:auth-expired', expired)
    await expect(request('/profile')).rejects.toMatchObject({ status: 401 })
    expect(auth.signOut).toHaveBeenCalled()
    expect(expired).toHaveBeenCalled()
    window.removeEventListener('sankatai:auth-expired', expired)
  })

  it('treats a second 401 after refresh as expiry', async () => {
    fetch.mockResolvedValue(res(401))
    auth.refreshSession.mockResolvedValue({})
    await expect(request('/profile')).rejects.toMatchObject({ status: 401 })
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(auth.signOut).toHaveBeenCalled()
  })

  it('exposes status and code on API errors', async () => {
    fetch.mockResolvedValue(res(403, { detail: 'Admin access required.', code: 'forbidden' }))
    await expect(request('/admin/admins')).rejects.toMatchObject({ status: 403, code: 'forbidden', message: 'Admin access required.' })
  })
})
