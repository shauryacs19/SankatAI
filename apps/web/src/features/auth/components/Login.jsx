import { useState } from 'react'
import { useLocation } from 'react-router-dom'
import Header from '../../../components/layout/Header'
import { signUp, confirmSignUp, resendConfirmationCode, isCognitoConfigured } from '../../../services/auth/cognito'
import { useAuth } from '../../../context/AuthContext.jsx'

const emptyForm = { email: '', password: '', confirmPassword: '', code: '' }

function Login() {
  // No useNavigate/useProfile here any more: sign-in is a full-page redirect to
  // the Hosted UI, so routing and profile preload happen on the /auth/callback
  // return trip instead of in this component.
  const location = useLocation()
  const { signIn } = useAuth()
  // Landing's "Get started" passes { mode: 'signup' } to open create-account.
  const [mode, setMode] = useState(location.state?.mode === 'signup' ? 'signup' : 'signin') // 'signin' | 'signup' | 'confirm'
  const [form, setForm] = useState(emptyForm)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    if (error) setError('')
  }

  const switchMode = (nextMode) => {
    setMode(nextMode)
    setError('')
    setNotice('')
  }

  // Sign-in is a full-page redirect to the Cognito Hosted UI (OAuth code flow
  // with PKCE). Credentials are never typed into this app, so there is no
  // password field to submit and nothing to await — the browser navigates away.
  // The return trip lands on /auth/callback, which AuthContext handles.
  const handleSignIn = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await signIn()
    } catch (err) {
      setError(err.message || 'Unable to reach the sign-in service.')
      setSubmitting(false)
    }
  }

  const handleSignUp = async (e) => {
    e.preventDefault()
    setError('')

    if (form.password !== form.confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setSubmitting(true)
    try {
      await signUp(form.email.trim(), form.password)
      setNotice(`We sent a verification code to ${form.email.trim()}.`)
      setMode('confirm')
    } catch (err) {
      setError(err.message || 'Unable to create account.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirm = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await confirmSignUp(form.email.trim(), form.code.trim())
      setNotice('Account verified. You can now sign in.')
      setForm((prev) => ({ ...emptyForm, email: prev.email }))
      setMode('signin')
    } catch (err) {
      setError(err.message || 'Invalid or expired code.')
    } finally {
      setSubmitting(false)
    }
  }

  const handleResendCode = async () => {
    setError('')
    try {
      await resendConfirmationCode(form.email.trim())
      setNotice(`Verification code resent to ${form.email.trim()}.`)
    } catch (err) {
      setError(err.message || 'Unable to resend code.')
    }
  }

  return (
    <div className="app auth-page">
      <Header isOffline={false} />

      <main>
        <div className="onboarding-hero">
          <div className="onboarding-hero-icon">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M11.25 4.53l-6.72 3.36a2 2 0 00-1.03 1.57v4.61c0 4.15 2.62 7.89 6.46 9.2a2 2 0 001.28 0c3.84-1.31 6.46-5.05 6.46-9.2v-4.6a2 2 0 00-1.03-1.58l-6.72-3.36a2 2 0 00-1.78 0z" />
              <path fillRule="evenodd" d="M12 7.5a.75.75 0 01.75.75v3h3a.75.75 0 010 1.5h-3v3a.75.75 0 01-1.5 0v-3h-3a.75.75 0 010-1.5h3v-3A.75.75 0 0112 7.5z" clipRule="evenodd" />
            </svg>
          </div>
          <h2>{mode === 'confirm' ? 'Verify Your Email' : 'Welcome to Sankat.Ai'}</h2>
          <p>
            {mode === 'confirm'
              ? 'Enter the 6-digit code we emailed you to activate your account.'
              : 'Sign in to sync your emergency profile, or create an account to get started.'}
          </p>
          <div className="privacy-badge">
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z" clipRule="evenodd" />
            </svg>
            Secured by Amazon Cognito
          </div>
        </div>

        <section className="onboarding-section auth-card">
          {!isCognitoConfigured() && (
            <div className="auth-alert error">
              Cognito is not configured. Set <code>VITE_COGNITO_USER_POOL_ID</code> and{' '}
              <code>VITE_COGNITO_CLIENT_ID</code> in <code>frontend/.env</code> (see{' '}
              <code>.env.example</code>).
            </div>
          )}

          {mode !== 'confirm' && (
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab ${mode === 'signin' ? 'active' : ''}`}
                onClick={() => switchMode('signin')}
              >
                Sign In
              </button>
              <button
                type="button"
                className={`auth-tab ${mode === 'signup' ? 'active' : ''}`}
                onClick={() => switchMode('signup')}
              >
                Create Account
              </button>
            </div>
          )}

          {error && <div className="auth-alert error">{error}</div>}
          {notice && !error && <div className="auth-alert notice">{notice}</div>}

          {mode === 'signin' && (
            <form className="form-grid" onSubmit={handleSignIn}>
              {/* No email/password inputs by design: credentials are entered on
                  the Cognito Hosted UI, never in this application. That keeps
                  the password out of our DOM, our bundle and our error reports. */}
              <p className="auth-hint">
                You&apos;ll be taken to our secure Amazon Cognito sign-in page, then
                brought straight back.
              </p>
              <button type="submit" className="dock-btn primary auth-submit" disabled={submitting}>
                {submitting ? 'Redirecting…' : 'Continue to secure sign-in'}
              </button>
            </form>
          )}

          {mode === 'signup' && (
            <form className="form-grid" onSubmit={handleSignUp}>
              <div className="field">
                <label>Email <span className="req">*</span></label>
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={form.email}
                  onChange={handleChange('email')}
                  placeholder="you@example.com"
                />
              </div>
              <div className="field">
                <label>Password <span className="req">*</span></label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.password}
                  onChange={handleChange('password')}
                  placeholder="Min. 8 characters, upper & lowercase, a number"
                />
              </div>
              <div className="field">
                <label>Confirm Password <span className="req">*</span></label>
                <input
                  type="password"
                  required
                  autoComplete="new-password"
                  value={form.confirmPassword}
                  onChange={handleChange('confirmPassword')}
                  placeholder="••••••••"
                />
              </div>
              <button type="submit" className="dock-btn primary auth-submit" disabled={submitting}>
                {submitting ? 'Creating Account…' : 'Create Account'}
              </button>
            </form>
          )}

          {mode === 'confirm' && (
            <form className="form-grid" onSubmit={handleConfirm}>
              <div className="field">
                <label>Verification Code <span className="req">*</span></label>
                <input
                  type="text"
                  required
                  inputMode="numeric"
                  value={form.code}
                  onChange={handleChange('code')}
                  placeholder="123456"
                />
              </div>
              <button type="submit" className="dock-btn primary auth-submit" disabled={submitting}>
                {submitting ? 'Verifying…' : 'Verify Account'}
              </button>
              <button type="button" className="ghost-button" onClick={handleResendCode}>
                Resend Code
              </button>
            </form>
          )}
        </section>
      </main>

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-brand">
            <span className="footer-cross">✚</span> Sankat.Ai
          </div>
          <hr className="footer-divider" />
          <p className="footer-text">
            AI-powered emergency triage. Not a substitute for professional medical advice.
          </p>
          <p className="footer-text">© 2026 Sankat.Ai — All data stored locally on your device.</p>
        </div>
      </footer>
    </div>
  )
}

export default Login
