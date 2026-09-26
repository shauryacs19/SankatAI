import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { parseIdentifier } from '@sankatai/shared'
import { confirmResetPassword, resetPassword } from '../../../services/auth/cognito'
import { authErrorMessage, passwordOk } from '../../../services/auth/authErrors'
import { Alert, Button, Field, Input, useToast } from '../../../components/ui'
import { AuthLayout, CodeInput, PasswordChecklist, PasswordInput } from './AuthLayout.jsx'

export default function ForgotPassword() {
  const navigate = useNavigate()
  const location = useLocation()
  const toast = useToast()
  const [step, setStep] = useState('request') // 'request' | 'reset'
  const [identifier, setIdentifier] = useState(location.state?.identifier || location.state?.email || '')
  const [code, setCode] = useState('')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const first = useRef(null)

  useEffect(() => { first.current?.focus() }, [step])
  useEffect(() => () => { setPassword(''); setConfirm(''); setCode('') }, [])

  const parsed = parseIdentifier(identifier)
  const idErr = !parsed ? 'Enter your username, email or phone number.' : ''
  const codeErr = code.length !== 6 ? 'Enter the 6-digit code.' : ''
  const pwErr = !passwordOk(password) ? 'Choose a password that meets every requirement.' : ''
  const confirmErr = confirm !== password || !confirm ? 'The passwords don’t match.' : ''

  const request = async (e) => {
    e.preventDefault()
    setTouched({ identifier: true })
    if (idErr) return
    setSubmitting(true)
    setError('')
    try {
      await resetPassword(parsed.value)
      setTouched({})
      setStep('reset')
    } catch (err) {
      // Enumeration-safe: an unknown account proceeds like a known one.
      if (err?.code === 'UserNotFoundException') { setTouched({}); setStep('reset') } else {
        setError(authErrorMessage(err, 'Couldn’t start the reset. Try again.'))
      }
    } finally {
      setSubmitting(false)
    }
  }

  const reset = async (e) => {
    e.preventDefault()
    setTouched({ code: true, password: true, confirm: true })
    if (codeErr || pwErr || confirmErr) return
    setSubmitting(true)
    setError('')
    try {
      await confirmResetPassword(parsed.value, code, password)
      toast.success('Password reset. Sign in with your new password.')
      navigate('/login', { replace: true, state: { identifier: identifier.trim() } })
    } catch (err) {
      setError(authErrorMessage(err, 'Couldn’t reset your password. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <AuthLayout
      title={step === 'request' ? 'Reset your password' : 'Choose a new password'}
      lead={step === 'request'
        ? 'Enter your username, email or phone number. We’ll send a 6-digit code to the email or phone on the account.'
        : 'If that account exists, we sent a 6-digit code to its email or phone.'}
      footer={<p><Link className="auth-link" to="/login">Back to sign in</Link></p>}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      {step === 'request' ? (
        <form className="ui-form" onSubmit={request} noValidate>
          <Field label="Email, phone or username" required error={touched.identifier ? idErr || undefined : undefined}>
            <Input ref={first} autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifier}
              onChange={(e) => { setIdentifier(e.target.value); setError('') }} onBlur={() => setTouched({ identifier: true })} />
          </Field>
          <Button type="submit" variant="primary" block loading={submitting} loadingText="Sending code…">Send code</Button>
        </form>
      ) : (
        <form className="ui-form" onSubmit={reset} noValidate>
          <Field label="Verification code" required error={touched.code ? codeErr || undefined : undefined}>
            <CodeInput ref={first} value={code} onChange={(v) => { setCode(v); setError('') }} />
          </Field>
          <Field label="New password" required error={touched.password ? pwErr || undefined : undefined}>
            <PasswordInput autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)}
              aria-describedby="reset-pw-rules" />
          </Field>
          <PasswordChecklist password={password} id="reset-pw-rules" />
          <Field label="Confirm new password" required error={touched.confirm ? confirmErr || undefined : undefined}>
            <PasswordInput autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" block loading={submitting} loadingText="Resetting…">Reset password</Button>
          <Button variant="ghost" block onClick={() => { setStep('request'); setError('') }}>Use a different account</Button>
        </form>
      )}
    </AuthLayout>
  )
}
