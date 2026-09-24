import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { ShieldCheck, Phone, ArrowRight } from 'lucide-react'
import { isEmail } from '@sankatai/shared'
import { signUp, confirmSignUp, resendConfirmationCode, isCognitoConfigured } from '../../../services/auth/cognito'
import { useAuth } from '../../../context/AuthContext.jsx'
import { Alert, Brand, Button, Field, Input, SkipLink, Tabs } from '../../../components/ui'
import { AUTH_CSS } from './auth.styles'
import { errText } from '../../../utils/errText'

const emptyForm = { email: '', password: '', confirmPassword: '', code: '' }
const PASSWORD_RULE = 'At least 8 characters, with upper- and lowercase letters and a number.'

function Login() {
  // Sign-in is a full-page redirect to the Cognito Hosted UI, so routing and
  // profile preload happen on the /auth/callback return trip.
  const location = useLocation()
  const { signIn } = useAuth()
  // Landing's "Get started" passes { mode: 'signup' } to open create-account.
  const [mode, setMode] = useState(location.state?.mode === 'signup' ? 'signup' : 'signin') // 'signin' | 'signup' | 'confirm'
  const [form, setForm] = useState(emptyForm)
  const [touched, setTouched] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)

  const handleChange = (field) => (e) => {
    setForm((prev) => ({ ...prev, [field]: e.target.value }))
    if (error) setError('')
  }
  const touch = (field) => () => setTouched((t) => ({ ...t, [field]: true }))

  const switchMode = (nextMode) => { setMode(nextMode); setError(''); setNotice(''); setTouched({}) }

  // Credentials are never typed into this app for sign-in: the browser goes to
  // the Hosted UI and comes back to /auth/callback (AuthContext handles it).
  const handleSignIn = async (e) => {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await signIn()
    } catch (err) {
      setError(errText(err, 'Unable to reach the sign-in service.'))
      setSubmitting(false)
    }
  }

  const emailErr = !form.email.trim() ? 'Enter your email address.' : !isEmail(form.email) ? 'Enter a valid email address, like name@example.com.' : ''
  const pwErr = form.password.length < 8 ? 'Use at least 8 characters.' : ''
  const confirmErr = form.confirmPassword !== form.password ? 'The passwords don’t match.' : ''

  const handleSignUp = async (e) => {
    e.preventDefault()
    setTouched({ email: true, password: true, confirmPassword: true })
    setError('')
    if (emailErr || pwErr || confirmErr) return
    setSubmitting(true)
    try {
      await signUp(form.email.trim(), form.password)
      setNotice(`We sent a 6-digit verification code to ${form.email.trim()}.`)
      setMode('confirm')
    } catch (err) {
      setError(errText(err, 'Unable to create your account.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleConfirm = async (e) => {
    e.preventDefault()
    setTouched({ code: true })
    if (!form.code.trim()) return
    setSubmitting(true)
    setError('')
    try {
      await confirmSignUp(form.email.trim(), form.code.trim())
      setNotice('Your account is verified. Continue to sign in.')
      setForm((prev) => ({ ...emptyForm, email: prev.email }))
      setMode('signin')
    } catch (err) {
      setError(errText(err, 'That code is invalid or has expired.'))
    } finally {
      setSubmitting(false)
    }
  }

  const handleResendCode = async () => {
    setError('')
    setResending(true)
    try {
      await resendConfirmationCode(form.email.trim())
      setNotice(`A new code is on its way to ${form.email.trim()}.`)
    } catch (err) {
      setError(errText(err, 'Unable to resend the code.'))
    } finally {
      setResending(false)
    }
  }

  const title = mode === 'confirm' ? 'Verify your email' : mode === 'signup' ? 'Create your account' : 'Sign in to SankatAI'
  const lead = mode === 'confirm'
    ? `Enter the 6-digit code we emailed to ${form.email.trim() || 'you'}.`
    : 'Your health profile, chats and documents, synced to your account.'

  return (
    <div className="auth">
      <style>{AUTH_CSS}</style>
      <SkipLink />
      <header className="auth-bar">
        <Link to="/" className="auth-home" aria-label="SankatAI home"><Brand size="sm" /></Link>
        <Button variant="emergency" icon={Phone} href="tel:108" aria-label="Emergency — call 108">108</Button>
      </header>

      <main id="main" tabIndex={-1} className="auth-main">
        <div className="auth-card">
          <div className="auth-head">
            <h1 className="auth-title">{title}</h1>
            <p className="auth-lead">{lead}</p>
          </div>

          {!isCognitoConfigured() && (
            <Alert tone="danger" title="Sign-in isn't configured.">
              Set <code>VITE_COGNITO_DOMAIN</code>, <code>VITE_COGNITO_CLIENT_ID</code> and <code>VITE_COGNITO_USER_POOL_ID</code> for <code>apps/web</code>.
            </Alert>
          )}

          {mode !== 'confirm' && (
            <Tabs
              label="Sign in or create an account"
              idBase="auth"
              value={mode}
              onChange={switchMode}
              tabs={[{ value: 'signin', label: 'Sign in' }, { value: 'signup', label: 'Create account' }]}
            />
          )}

          <div id="auth-panel" role={mode !== 'confirm' ? 'tabpanel' : undefined} aria-labelledby={mode !== 'confirm' ? `auth-${mode}` : undefined} className="auth-panel">
            {error && <Alert tone="danger">{error}</Alert>}
            {notice && !error && <Alert tone="success">{notice}</Alert>}

            {mode === 'signin' && (
              <form className="ui-form" onSubmit={handleSignIn} noValidate>
                <p className="auth-note">
                  <ShieldCheck size={16} aria-hidden="true" />
                  <span>You'll enter your password on the secure Amazon Cognito page, then come straight back. Your password never passes through SankatAI.</span>
                </p>
                <Button type="submit" variant="primary" block iconEnd={ArrowRight} loading={submitting} loadingText="Redirecting to secure sign-in…">
                  Continue to secure sign-in
                </Button>
              </form>
            )}

            {mode === 'signup' && (
              <form className="ui-form" onSubmit={handleSignUp} noValidate>
                <Field label="Email" required error={touched.email ? emailErr : undefined}>
                  <Input type="email" autoComplete="email" inputMode="email" value={form.email} onChange={handleChange('email')} onBlur={touch('email')} placeholder="name@example.com" />
                </Field>
                <Field label="Password" required hint={PASSWORD_RULE} error={touched.password ? pwErr : undefined}>
                  <Input type="password" autoComplete="new-password" value={form.password} onChange={handleChange('password')} onBlur={touch('password')} />
                </Field>
                <Field label="Confirm password" required error={touched.confirmPassword ? confirmErr : undefined}>
                  <Input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={handleChange('confirmPassword')} onBlur={touch('confirmPassword')} />
                </Field>
                <Button type="submit" variant="primary" block loading={submitting} loadingText="Creating your account…">Create account</Button>
              </form>
            )}

            {mode === 'confirm' && (
              <form className="ui-form" onSubmit={handleConfirm} noValidate>
                <Field label="Verification code" required error={touched.code && !form.code.trim() ? 'Enter the code from the email.' : undefined}>
                  <Input inputMode="numeric" autoComplete="one-time-code" value={form.code} onChange={handleChange('code')} onBlur={touch('code')} />
                </Field>
                <Button type="submit" variant="primary" block loading={submitting} loadingText="Verifying…">Verify account</Button>
                <Button variant="ghost" block onClick={handleResendCode} loading={resending} loadingText="Sending a new code…">Send a new code</Button>
              </form>
            )}
          </div>
        </div>

        <p className="auth-foot">
          SankatAI gives guidance, not a diagnosis. In an emergency, <a href="tel:108">call 108</a>.
        </p>
      </main>
    </div>
  )
}

export default Login
