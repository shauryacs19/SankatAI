import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { isEmail } from '@sankatai/shared'
import { confirmSignUp, resendSignUpCode } from '../../../services/auth/cognito'
import { authErrorMessage, loginPath, safeReturnTo } from '../../../services/auth/authErrors'
import { Alert, Button, Field, Input, useToast } from '../../../components/ui'
import { AuthLayout, CodeInput } from './AuthLayout.jsx'
import { useCooldown } from './authHooks'

const RESEND_SECONDS = 60

export default function Verify() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const returnTo = safeReturnTo(location.state?.returnTo)
  const knownEmail = location.state?.email || ''
  const [email, setEmail] = useState(knownEmail)
  const [code, setCode] = useState('')
  const [touched, setTouched] = useState({})
  const [error, setError] = useState('')
  const [notice, setNotice] = useState(knownEmail
    ? `We sent a 6-digit code to ${knownEmail}.`
    : '')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useCooldown()
  const first = useRef(null)
  const autoSent = useRef(false)

  const resend = async () => {
    if (cooldown > 0 || !isEmail(email.trim())) return
    setResending(true)
    setError('')
    try {
      await resendSignUpCode(email)
      setNotice(`A new code is on its way to ${email.trim()}.`)
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
    if (location.state?.fromLogin && knownEmail && !autoSent.current) {
      autoSent.current = true
      resend()
    }
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const emailErr = !isEmail(email.trim()) ? 'Enter the email you signed up with.' : ''
  const codeErr = code.length !== 6 ? 'Enter the 6-digit code from the email.' : ''

  const submit = async (e) => {
    e.preventDefault()
    setTouched({ email: true, code: true })
    if (emailErr || codeErr) return
    setSubmitting(true)
    setError('')
    try {
      await confirmSignUp(email, code)
      toast.success('Email verified. Sign in to continue.')
      navigate(loginPath(returnTo), { replace: true, state: { email: email.trim().toLowerCase() } })
    } catch (err) {
      setError(authErrorMessage(err, 'Couldn’t verify that code. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title="Verify your email"
      lead="Enter the 6-digit code we emailed you."
      footer={<p><Link className="auth-link" to="/login">Back to sign in</Link></p>}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && !error && <Alert tone="info">{notice}</Alert>}
      <form className="ui-form" onSubmit={submit} noValidate>
        {!knownEmail && (
          <Field label="Email" required error={touched.email ? emailErr || undefined : undefined}>
            <Input type="email" autoComplete="email" inputMode="email" value={email}
              onChange={(e) => setEmail(e.target.value)} onBlur={() => setTouched((t) => ({ ...t, email: true }))} />
          </Field>
        )}
        <Field label="Verification code" required error={touched.code ? codeErr || undefined : undefined}>
          <CodeInput ref={first} value={code} onChange={(v) => { setCode(v); setError('') }} />
        </Field>
        <Button type="submit" variant="primary" block loading={submitting} loadingText="Verifying…">Verify email</Button>
        <Button variant="ghost" block onClick={resend} loading={resending} loadingText="Sending…" disabled={cooldown > 0}
          hint={cooldown > 0 ? `You can request another code in ${cooldown}s.` : undefined}>
          {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
        </Button>
      </form>
    </AuthLayout>
  )
}
