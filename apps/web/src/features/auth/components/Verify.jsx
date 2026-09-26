import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { maskPhone } from '@sankatai/shared'
import { confirmSignUp, resendSignUpCode } from '../../../services/auth/cognito'
import { authErrorMessage, loginPath, safeReturnTo } from '../../../services/auth/authErrors'
import { Alert, Button, Field, useToast } from '../../../components/ui'
import { AuthLayout, CodeInput } from './AuthLayout.jsx'
import { clearPendingSignUp, readPendingSignUp, useCooldown } from './authHooks'

const RESEND_SECONDS = 60

// Confirms a new account with the code sent to its email or phone. Until then
// only the hidden Cognito username identifies the account, so this page needs
// the pending sign-up (route state, or sessionStorage after a reload).
export default function Verify() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const returnTo = safeReturnTo(location.state?.returnTo)
  const [pending] = useState(() => (location.state?.username ? location.state : readPendingSignUp()))
  const byPhone = pending?.via === 'phone'
  const shownTo = pending ? (byPhone ? maskPhone(pending.destination) : pending.destination) : ''
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(pending && !location.state?.fromLogin ? `We sent a 6-digit code to ${shownTo}.` : '')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useCooldown()
  const first = useRef(null)
  const autoSent = useRef(false)

  const resend = async () => {
    if (cooldown > 0 || !pending) return
    setResending(true)
    setError('')
    try {
      await resendSignUpCode(pending.username)
      setNotice(`A new code is on its way to ${shownTo}.`)
      setCooldown(RESEND_SECONDS)
    } catch (err) {
      setError(authErrorMessage(err, 'Couldn’t send a new code. Try again.'))
    } finally {
      setResending(false)
    }
  }

  useEffect(() => { first.current?.focus() }, [])
  // Sent here by the login form for an unconfirmed account: that account has
  // no fresh code yet, so send one once.
  useEffect(() => {
    if (location.state?.fromLogin && pending && !autoSent.current) {
      autoSent.current = true
      resend()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const codeErr = code.length !== 6 ? 'Enter the 6-digit code.' : ''

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (codeErr || !pending) return
    setSubmitting(true)
    setError('')
    try {
      await confirmSignUp(pending.username, code)
      clearPendingSignUp()
      toast.success(`${byPhone ? 'Phone number' : 'Email'} verified. Sign in to continue.`)
      navigate(loginPath(returnTo), { replace: true, state: { identifier: pending.handle || pending.destination } })
    } catch (err) {
      setError(authErrorMessage(err, 'Couldn’t verify that code. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  if (!pending) {
    return (
      <AuthLayout
        title="Finish creating your account"
        lead="We couldn’t find a sign-up in progress in this browser."
        footer={<p><Link className="auth-link" to="/login">Back to sign in</Link></p>}
      >
        <Alert tone="info">
          Start again and use the same email or phone number. A sign-up that was never verified doesn’t block it.
        </Alert>
        <Button variant="primary" block onClick={() => navigate('/signup', { state: { returnTo } })}>Create an account</Button>
      </AuthLayout>
    )
  }

  return (
    <AuthLayout
      title={byPhone ? 'Verify your phone number' : 'Verify your email'}
      lead={byPhone ? 'Enter the 6-digit code we texted you.' : 'Enter the 6-digit code we emailed you.'}
      footer={<p><Link className="auth-link" to="/login">Back to sign in</Link></p>}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && !error && <Alert tone="info">{notice}</Alert>}
      <form className="ui-form" onSubmit={submit} noValidate>
        <Field label="Verification code" required error={touched ? codeErr || undefined : undefined}>
          <CodeInput ref={first} value={code} onChange={(v) => { setCode(v); setError('') }} />
        </Field>
        <Button type="submit" variant="primary" block loading={submitting} loadingText="Verifying…">
          {byPhone ? 'Verify phone number' : 'Verify email'}
        </Button>
        <Button variant="ghost" block onClick={resend} loading={resending} loadingText="Sending…" disabled={cooldown > 0}
          hint={cooldown > 0 ? `You can request another code in ${cooldown}s.` : undefined}>
          {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
        </Button>
      </form>
    </AuthLayout>
  )
}
