import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { isEmail } from '@sankatai/shared'
import { useAuth } from '../../../context/AuthContext.jsx'
import { cancelPendingSignIn, isCognitoConfigured, NEXT_STEP } from '../../../services/auth/cognito'
import { authErrorMessage, passwordOk, safeReturnTo } from '../../../services/auth/authErrors'
import { Alert, Button, Field, Input } from '../../../components/ui'
import { AuthLayout, CodeInput, PasswordChecklist, PasswordInput } from './AuthLayout.jsx'
import { useFailureThrottle } from './authHooks'

const TITLES = {
  signin: ['Sign in to SankatAI', 'Your health profile, chats and documents, synced to your account.'],
  [NEXT_STEP.NEW_PASSWORD]: ['Set a new password', 'Your account needs a new password before you continue.'],
  [NEXT_STEP.TOTP]: ['Enter your authenticator code', 'Open your authenticator app and enter the 6-digit code.'],
  [NEXT_STEP.SMS]: ['Enter the SMS code', 'We sent a 6-digit code to your phone.'],
}

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { signIn, confirmSignIn } = useAuth()
  const returnTo = safeReturnTo(params.get('returnTo'))

  const [step, setStep] = useState('signin')
  const [email, setEmail] = useState(location.state?.email || '')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [touched, setTouched] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const throttle = useFailureThrottle()
  const firstField = useRef(null)

  // Nothing sensitive outlives the page: drop any half-finished challenge.
  useEffect(() => () => cancelPendingSignIn(), [])
  useEffect(() => { firstField.current?.focus() }, [step])

  const done = () => navigate(returnTo || '/app', { replace: true })

  const next = (result) => {
    if (result.nextStep === NEXT_STEP.DONE) return done()
    if (result.nextStep === NEXT_STEP.CONFIRM_SIGN_UP) {
      return navigate('/verify', { state: { email: email.trim().toLowerCase(), returnTo, fromLogin: true } })
    }
    setPassword('')
    setTouched({})
    setStep(result.nextStep)
    return undefined
  }

  const run = async (fn) => {
    if (throttle.locked) return
    setSubmitting(true)
    setError('')
    try {
      next(await fn())
      throttle.reset()
    } catch (err) {
      throttle.fail()
      setError(authErrorMessage(err, 'Couldn’t sign you in. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  const emailErr = !email.trim() ? 'Enter your email address.' : !isEmail(email.trim()) ? 'Enter a valid email address, like name@example.com.' : ''
  const passwordErr = !password ? 'Enter your password.' : ''
  const codeErr = code.length !== 6 ? 'Enter the 6-digit code.' : ''
  const newPwErr = !passwordOk(newPassword) ? 'Choose a password that meets every requirement.' : ''
  const confirmErr = confirmPassword !== newPassword ? 'The passwords don’t match.' : ''

  const submitSignIn = (e) => {
    e.preventDefault()
    setTouched({ email: true, password: true })
    if (emailErr || passwordErr) return
    run(() => signIn({ username: email, password, remember }))
  }
  const submitNewPassword = (e) => {
    e.preventDefault()
    setTouched({ newPassword: true, confirmPassword: true })
    if (newPwErr || confirmErr) return
    run(() => confirmSignIn({ newPassword }))
  }
  const submitCode = (e) => {
    e.preventDefault()
    setTouched({ code: true })
    if (codeErr) return
    run(() => confirmSignIn({ code }))
  }

  const [title, lead] = TITLES[step]
  const lockedHint = throttle.locked ? `Too many attempts. Try again in ${throttle.lockedFor}s.` : undefined

  return (
    <AuthLayout
      title={title}
      lead={lead}
      footer={step === 'signin' && (
        <p>New to SankatAI? <Link className="auth-link" to="/signup" state={{ returnTo }}>Create an account</Link></p>
      )}
    >
      {!isCognitoConfigured() && (
        <Alert tone="danger" title="Sign-in isn't configured.">
          Set <code>VITE_COGNITO_USER_POOL_ID</code> and <code>VITE_COGNITO_CLIENT_ID</code> for <code>apps/web</code>.
        </Alert>
      )}
      {error && <Alert tone="danger">{error}</Alert>}

      {step === 'signin' && (
        <form className="ui-form" onSubmit={submitSignIn} noValidate>
          <Field label="Email" required error={touched.email ? emailErr : undefined}>
            <Input ref={firstField} type="email" autoComplete="username" inputMode="email" value={email}
              onChange={(e) => { setEmail(e.target.value); setError('') }} onBlur={() => setTouched((t) => ({ ...t, email: true }))}
              placeholder="name@example.com" />
          </Field>
          <Field label="Password" required error={touched.password ? passwordErr : undefined}>
            <PasswordInput autoComplete="current-password" value={password}
              onChange={(e) => { setPassword(e.target.value); setError('') }} onBlur={() => setTouched((t) => ({ ...t, password: true }))} />
          </Field>
          <div className="auth-row">
            <label className="auth-check">
              <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
              Remember me
            </label>
            <Link className="auth-link" to="/forgot-password" state={{ email: email.trim() }}>Forgot password?</Link>
          </div>
          <Button type="submit" variant="primary" block loading={submitting} loadingText="Signing in…"
            disabled={throttle.locked} hint={lockedHint}>
            Sign in
          </Button>
          <p className="auth-note">
            <ShieldCheck size={16} aria-hidden="true" />
            <span>Your password is checked by Amazon Cognito using SRP. It is never sent to SankatAI.</span>
          </p>
        </form>
      )}

      {step === NEXT_STEP.NEW_PASSWORD && (
        <form className="ui-form" onSubmit={submitNewPassword} noValidate>
          <Field label="New password" required error={touched.newPassword ? newPwErr : undefined}>
            <PasswordInput ref={firstField} autoComplete="new-password" value={newPassword}
              aria-describedby="login-pw-rules" onChange={(e) => setNewPassword(e.target.value)} />
          </Field>
          <PasswordChecklist password={newPassword} id="login-pw-rules" />
          <Field label="Confirm new password" required error={touched.confirmPassword ? confirmErr : undefined}>
            <PasswordInput autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </Field>
          <Button type="submit" variant="primary" block loading={submitting} loadingText="Saving…"
            disabled={throttle.locked} hint={lockedHint}>
            Set password and sign in
          </Button>
        </form>
      )}

      {(step === NEXT_STEP.TOTP || step === NEXT_STEP.SMS) && (
        <form className="ui-form" onSubmit={submitCode} noValidate>
          <Field label="6-digit code" required error={touched.code ? codeErr : undefined}>
            <CodeInput ref={firstField} value={code} onChange={setCode} />
          </Field>
          <Button type="submit" variant="primary" block loading={submitting} loadingText="Verifying…"
            disabled={throttle.locked} hint={lockedHint}>
            Verify
          </Button>
        </form>
      )}
    </AuthLayout>
  )
}
