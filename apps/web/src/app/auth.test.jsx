// @vitest-environment jsdom
// Public/protected routing and every sign-in / sign-up / reset flow, with the
// Cognito library mocked. Nothing here may navigate to a Hosted UI.
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'

const auth = vi.hoisted(() => ({
  restoreSession: vi.fn(),
  signIn: vi.fn(),
  confirmSignIn: vi.fn(),
  signOut: vi.fn(),
  refreshSession: vi.fn(),
  signUp: vi.fn(),
  confirmSignUp: vi.fn(),
  resendSignUpCode: vi.fn(),
  resetPassword: vi.fn(),
  confirmResetPassword: vi.fn(),
  cancelPendingSignIn: vi.fn(),
  getValidAccessToken: vi.fn(async () => 'access-token'),
  getIdToken: vi.fn(() => 'id-token'),
  changePassword: vi.fn(),
}))
vi.mock('../services/auth/cognito', () => ({
  ...auth,
  isCognitoConfigured: () => true,
  NEXT_STEP: {
    DONE: 'DONE', CONFIRM_SIGN_UP: 'CONFIRM_SIGN_UP', NEW_PASSWORD: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED',
    TOTP: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE', SMS: 'CONFIRM_SIGN_IN_WITH_SMS_CODE',
  },
}))
const api = vi.hoisted(() => ({ request: vi.fn() }))
vi.mock('../services/api/httpClient', () => api)

import AppWithAuth from './App.jsx'
import { safeReturnTo } from '../services/auth/authErrors'

const USER = { userId: 'u1', email: 'asha@gmail.com', name: 'Asha', groups: [] }
const cognitoError = (code) => Object.assign(new Error(code), { code })

function Probe() {
  const loc = useLocation()
  return <output data-testid="loc">{loc.pathname + loc.search}</output>
}

function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppWithAuth />
      <Routes><Route path="*" element={<Probe />} /></Routes>
    </MemoryRouter>,
  )
}
const loc = () => screen.getByTestId('loc').textContent
// Labels carry a required "*"; anchor at the start so "Password" != "Confirm password".
const type = (label, value) => fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`), { selector: 'input' }), { target: { value } })
const PROFILE = { fullName: 'Asha', dob: '1990-01-01', gender: 'Female', bloodGroup: 'O+', phone: '9999999999', emergencyContacts: [{ name: 'A', phone: '1' }] }

beforeEach(() => {
  globalThis.IntersectionObserver = class { observe() {} unobserve() {} disconnect() {} }
  Object.values(auth).forEach((fn) => fn.mockReset?.())
  auth.getValidAccessToken.mockResolvedValue('access-token')
  auth.getIdToken.mockReturnValue('id-token')
  auth.restoreSession.mockResolvedValue(null)
  api.request.mockReset()
  api.request.mockImplementation(async (path) => (path.startsWith('/profile') ? PROFILE : []))
  Element.prototype.scrollTo = () => {}
})
afterEach(cleanup)

describe('public routes', () => {
  it('loads the home page for a guest without any redirect', async () => {
    const href = window.location.href
    renderAt('/')
    expect((await screen.findAllByRole('button', { name: 'Sign in' })).length).toBeGreaterThan(0)
    expect(screen.getAllByRole('button', { name: 'Sign up' }).length).toBeGreaterThan(0)
    expect(loc()).toBe('/')
    expect(window.location.href).toBe(href) // no full-page navigation (Hosted UI)
    expect(auth.restoreSession).toHaveBeenCalledTimes(1) // the silent check only
  })

  it('shows the user menu on the home page when signed in', async () => {
    auth.restoreSession.mockResolvedValue(USER)
    renderAt('/')
    expect((await screen.findAllByRole('button', { name: 'Open app' })).length).toBeGreaterThan(0)
    expect(screen.queryByRole('button', { name: 'Sign in' })).toBeNull()
  })
})

describe('protected routes', () => {
  it('send a guest to /login with returnTo', async () => {
    renderAt('/dashboard/files?tab=vault')
    await waitFor(() => expect(loc()).toBe(`/login?returnTo=${encodeURIComponent('/dashboard/files?tab=vault')}`))
  })

  it('keep the admin invite token through login', async () => {
    renderAt('/admin/invite/accept?token=abc.def')
    await waitFor(() => expect(loc()).toBe(`/login?returnTo=${encodeURIComponent('/admin/invite/accept?token=abc.def')}`))
  })

  it('block non-admins from the admin console', async () => {
    auth.restoreSession.mockResolvedValue(USER)
    renderAt('/admin')
    expect(await screen.findByRole('heading', { name: 'Admin access required' })).toBeTruthy()
  })
})

describe('returnTo sanitising', () => {
  it.each([
    ['https://evil.example/x', null], ['//evil.example/x', null], ['/\\evil.example', null],
    ['javascript:alert(1)', null], ['/login?returnTo=/x', null], ['/dashboard/chat', '/dashboard/chat'],
    ['/admin/invite/accept?token=a.b', '/admin/invite/accept?token=a.b'],
  ])('%s -> %s', (input, expected) => expect(safeReturnTo(input)).toBe(expected))
})

describe('login', () => {
  const submit = () => fireEvent.click(screen.getByRole('button', { name: 'Sign in' }))
  const fill = () => { type('Email', 'Asha@Gmail.com'); type('Password', 'Secret123') }

  it('signs in with SRP and returns to returnTo', async () => {
    auth.signIn.mockResolvedValue({ nextStep: 'DONE', user: USER })
    renderAt(`/login?returnTo=${encodeURIComponent('/dashboard/files')}`)
    await screen.findByRole('heading', { name: 'Sign in to SankatAI' })
    fill()
    submit()
    await waitFor(() => expect(loc()).toBe('/dashboard/files'))
    expect(auth.signIn).toHaveBeenCalledWith({ username: 'Asha@Gmail.com', password: 'Secret123', remember: true })
  })

  it('ignores an external returnTo', async () => {
    auth.signIn.mockResolvedValue({ nextStep: 'DONE', user: USER })
    renderAt(`/login?returnTo=${encodeURIComponent('https://evil.example/steal')}`)
    await screen.findByRole('heading', { name: 'Sign in to SankatAI' })
    fill()
    submit()
    await waitFor(() => expect(loc()).toMatch(/^\/(app|dashboard|profile-setup)/))
  })

  it('shows one generic message for a wrong password and an unknown user', async () => {
    renderAt('/login')
    await screen.findByRole('heading', { name: 'Sign in to SankatAI' })
    fill()
    auth.signIn.mockRejectedValueOnce(cognitoError('NotAuthorizedException'))
    submit()
    const first = (await screen.findByRole('alert')).textContent
    auth.signIn.mockRejectedValueOnce(cognitoError('UserNotFoundException'))
    submit()
    await waitFor(() => expect(auth.signIn).toHaveBeenCalledTimes(2))
    expect(screen.getByRole('alert').textContent).toBe(first)
    expect(first).toBe('Incorrect email or password.')
  })

  it('sends an unconfirmed user to /verify', async () => {
    auth.signIn.mockResolvedValue({ nextStep: 'CONFIRM_SIGN_UP' })
    auth.resendSignUpCode.mockResolvedValue({})
    renderAt('/login')
    await screen.findByRole('heading', { name: 'Sign in to SankatAI' })
    fill()
    submit()
    await waitFor(() => expect(loc()).toBe('/verify'))
    await waitFor(() => expect(auth.resendSignUpCode).toHaveBeenCalledWith('asha@gmail.com'))
  })

  it('renders the new-password challenge', async () => {
    auth.signIn.mockResolvedValue({ nextStep: 'CONFIRM_SIGN_IN_WITH_NEW_PASSWORD_REQUIRED' })
    auth.confirmSignIn.mockResolvedValue({ nextStep: 'DONE', user: USER })
    renderAt('/login')
    await screen.findByRole('heading', { name: 'Sign in to SankatAI' })
    fill()
    submit()
    expect(await screen.findByRole('heading', { name: 'Set a new password' })).toBeTruthy()
    type('New password', 'Brand1New')
    type('Confirm new password', 'Brand1New')
    fireEvent.click(screen.getByRole('button', { name: 'Set password and sign in' }))
    await waitFor(() => expect(auth.confirmSignIn).toHaveBeenCalledWith({ newPassword: 'Brand1New' }))
    await waitFor(() => expect(loc()).not.toMatch(/^\/login/))
  })

  it('renders the MFA code challenge', async () => {
    auth.signIn.mockResolvedValue({ nextStep: 'CONFIRM_SIGN_IN_WITH_TOTP_CODE' })
    renderAt('/login')
    await screen.findByRole('heading', { name: 'Sign in to SankatAI' })
    fill()
    submit()
    expect(await screen.findByRole('heading', { name: 'Enter your authenticator code' })).toBeTruthy()
    expect(screen.getByLabelText('6-digit code', { exact: false }).getAttribute('autocomplete')).toBe('one-time-code')
  })

  it('throttles after five failures', async () => {
    auth.signIn.mockRejectedValue(cognitoError('NotAuthorizedException'))
    renderAt('/login')
    await screen.findByRole('heading', { name: 'Sign in to SankatAI' })
    fill()
    for (let i = 0; i < 5; i += 1) {
      submit()
      await waitFor(() => expect(auth.signIn).toHaveBeenCalledTimes(i + 1))
    }
    await waitFor(() => expect(screen.getByRole('button', { name: 'Sign in' }).getAttribute('aria-disabled')).toBe('true'))
    submit()
    expect(auth.signIn).toHaveBeenCalledTimes(5)
  })
})

describe('sign-up and verification', () => {
  it('signs up, then verifies, then returns to login', async () => {
    auth.signUp.mockResolvedValue({})
    auth.confirmSignUp.mockResolvedValue('SUCCESS')
    renderAt('/signup')
    await screen.findByRole('heading', { name: 'Create your account' })
    type('Full name', 'Asha')
    type('Email', 'asha@gmail.com')
    type('Password', 'Secret123')
    type('Confirm password', 'Secret123')
    fireEvent.click(screen.getByRole('checkbox'))
    fireEvent.click(screen.getByRole('button', { name: 'Create account' }))
    await waitFor(() => expect(loc()).toBe('/verify'))
    expect(auth.signUp).toHaveBeenCalledWith({ email: 'asha@gmail.com', password: 'Secret123', name: 'Asha' })
    type('Verification code', '123456')
    fireEvent.click(screen.getByRole('button', { name: 'Verify email' }))
    await waitFor(() => expect(loc()).toBe('/login'))
    expect(auth.confirmSignUp).toHaveBeenCalledWith('asha@gmail.com', '123456')
  })

  it('shows the live password checklist and blocks weak passwords', async () => {
    renderAt('/signup')
    await screen.findByRole('heading', { name: 'Create your account' })
    type('Password', 'weak')
    expect(screen.getByText('An uppercase letter').parentElement.className).not.toContain('ok')
    type('Password', 'Weak12345')
    expect(screen.getByText('An uppercase letter').parentElement.className).toContain('ok')
  })

  it('rate-limits resending the code for 60 s', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    auth.resendSignUpCode.mockResolvedValue({})
    renderAt('/verify')
    await screen.findByRole('heading', { name: 'Verify your email' })
    type('Email', 'asha@gmail.com')
    fireEvent.click(screen.getByRole('button', { name: 'Resend code' }))
    await waitFor(() => expect(auth.resendSignUpCode).toHaveBeenCalledTimes(1))
    expect(await screen.findByRole('button', { name: /Resend code \(60s\)/ })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Resend code \(/ }))
    expect(auth.resendSignUpCode).toHaveBeenCalledTimes(1)
    // The countdown re-arms a 1 s timer after each render, so tick second by second.
    for (let i = 0; i < 61; i += 1) {
      await act(async () => { vi.advanceTimersByTime(1000) })
    }
    await waitFor(() => expect(screen.getByRole('button', { name: 'Resend code' })).toBeTruthy())
    vi.useRealTimers()
  })
})

describe('forgot password', () => {
  it('requests a code, then resets and returns to login', async () => {
    auth.resetPassword.mockResolvedValue({})
    auth.confirmResetPassword.mockResolvedValue('SUCCESS')
    renderAt('/forgot-password')
    await screen.findByRole('heading', { name: 'Reset your password' })
    type('Email', 'asha@gmail.com')
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    expect(await screen.findByRole('heading', { name: 'Choose a new password' })).toBeTruthy()
    type('Verification code', '654321')
    type('New password', 'Fresh1234')
    type('Confirm new password', 'Fresh1234')
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    await waitFor(() => expect(loc()).toBe('/login'))
    expect(auth.confirmResetPassword).toHaveBeenCalledWith('asha@gmail.com', '654321', 'Fresh1234')
  })

  it('shows an error for a bad code', async () => {
    auth.resetPassword.mockResolvedValue({})
    auth.confirmResetPassword.mockRejectedValue(cognitoError('CodeMismatchException'))
    renderAt('/forgot-password')
    await screen.findByRole('heading', { name: 'Reset your password' })
    type('Email', 'asha@gmail.com')
    fireEvent.click(screen.getByRole('button', { name: 'Send code' }))
    await screen.findByRole('heading', { name: 'Choose a new password' })
    type('Verification code', '000000')
    type('New password', 'Fresh1234')
    type('Confirm new password', 'Fresh1234')
    fireEvent.click(screen.getByRole('button', { name: 'Reset password' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/code is incorrect/)
    expect(loc()).toBe('/forgot-password')
  })
})

describe('session loss and logout', () => {
  it('clears the session on sign-out from the home page', async () => {
    auth.restoreSession.mockResolvedValue(USER)
    renderAt('/')
    fireEvent.click(await screen.findByRole('button', { name: /Account menu/ }))
    fireEvent.click(await screen.findByRole('menuitem', { name: 'Sign out' }))
    expect(auth.signOut).toHaveBeenCalled()
    expect((await screen.findAllByRole('button', { name: 'Sign in' })).length).toBeGreaterThan(0)
  })

  it('sends the user to /login when the API reports the session expired', async () => {
    auth.restoreSession.mockResolvedValue(USER)
    renderAt('/profile-setup')
    await waitFor(() => expect(loc()).toBe('/profile-setup'))
    act(() => { window.dispatchEvent(new CustomEvent('sankatai:auth-expired')) })
    await waitFor(() => expect(loc()).toBe(`/login?returnTo=${encodeURIComponent('/profile-setup')}`))
  })
})
