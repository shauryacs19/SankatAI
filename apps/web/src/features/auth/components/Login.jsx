import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { KeyRound, ShieldCheck } from 'lucide-react'
import { maskPhone, parseIdentifier, toE164 } from '@sankatai/shared'
import { useAuth } from '../../../context/AuthContext.jsx'
import { cancelPendingSignIn, isCognitoConfigured, NEXT_STEP, startCodeSignIn } from '../../../services/auth/cognito'
import { passkeysSupported } from '../../../services/auth/webauthn'
import { authErrorMessage, passwordOk, safeReturnTo } from '../../../services/auth/authErrors'
import { Alert, Button, Field, Input, SegmentedControl } from '../../../components/ui'
import { AuthLayout, CodeInput, PasswordChecklist, PasswordInput } from './AuthLayout.jsx'
import { useCooldown, useFailureThrottle } from './authHooks'

const RESEND_SECONDS = 60
const CODE_VERIFY = 'code-verify'

const TITLES = {
  signin: ['Sign in to SankatAI', 'Your health profile, chats and documents, synced to your account.'],
  [CODE_VERIFY]: ['Enter the code', ''],
  [NEXT_STEP.NEW_PASSWORD]: ['Set a new password', 'Your account needs a new password before you continue.'],
  [NEXT_STEP.TOTP]: ['Enter your authenticator code', 'Open your authenticator app and enter the 6-digit code.'],
  [NEXT_STEP.SMS]: ['Enter the SMS code', 'We sent a 6-digit code to your phone.'],
}

const METHODS = [
  { value: 'password', label: 'Password' },
  { value: 'code', label: 'Text me a code' },
  { value: 'passkey', label: 'Passkey' },
]
// The passkey tab only appears where the browser can use passkeys.
const methodsHere = () => (passkeysSupported() ? METHODS : METHODS.filter((m) => m.value !== 'passkey'))

export default function Login() {
  const navigate = useNavigate()
  const location = useLocation()
  const [params] = useSearchParams()
  const { signIn, confirmSignIn, confirmCodeSignIn, signInWithPasskey } = useAuth()
  const returnTo = safeReturnTo(params.get('returnTo'))

  const [step, setStep] = useState('signin')
  const [method, setMethod] = useState('password')
  const [identifier, setIdentifier] = useState(location.state?.identifier || location.state?.email || '')
  const [phone, setPhone] = useState('')
  const [sentTo, setSentTo] = useState('')
  const [password, setPassword] = useState('')
  const [remember, setRemember] = useState(true)
  const [code, setCode] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [touched, setTouched] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [resending, setResending] = useState(false)
  const [cooldown, setCooldown] = useCooldown()
  const throttle = useFailureThrottle()
  const firstField = useRef(null)

  // Nothing sensitive outlives the page: drop any half-finished challenge.
  useEffect(() => () => cancelPendingSignIn(), [])
  useEffect(() => { firstField.current?.focus() }, [step, method])

  const done = () => navigate(returnTo || '/app', { replace: true })

  const next = (result) => {
    if (result.nextStep === NEXT_STEP.DONE) return done()
    if (result.nextStep === NEXT_STEP.CONFIRM_SIGN_UP) {
      return navigate('/verify', { state: { returnTo, fromLogin: true } })
    }
    setPassword('')
    setTouched({})
    setStep(result.nextStep)
    return undefined
  }

  const run = async (fn, onResult = next) => {
    if (throttle.locked) return
    setSubmitting(true)
    setError('')
    try {
      onResult(await fn())
      throttle.reset()
    } catch (err) {
      throttle.fail()
      setError(authErrorMessage(err, 'Couldn’t sign you in. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  const parsed = parseIdentifier(identifier)
  const phoneE164 = toE164(phone)
  const idErr = !identifier.trim() ? 'Enter your username, email or phone number.'
    : !parsed ? 'Check that. Phone numbers need 10 digits or a country code, like +91 98765 43210.' : ''
  const phoneErr = !phone.trim() ? 'Enter your phone number.' : !phoneE164 ? 'Enter a valid number, like 98765 43210 or +91 98765 43210.' : ''
  const passwordErr = !password ? 'Enter your password.' : ''
  const codeErr = code.length !== 6 ? 'Enter the 6-digit code.' : ''
  const newPwErr = !passwordOk(newPassword) ? 'Choose a password that meets every requirement.' : ''
  const confirmErr = confirmPassword !== newPassword ? 'The passwords don’t match.' : ''

  const submitSignIn = (e) => {
    e.preventDefault()
    setTouched({ identifier: true, password: true })
    if (idErr || passwordErr) return
    run(() => signIn({ username: parsed.value, password, remember }))
  }

  const submitPasskey = (e) => {
    e.preventDefault()
    setTouched({ identifier: true })
    if (idErr) return
    run(() => signInWithPasskey({ username: parsed.value, remember }))
  }

  const sendCode = async () => {
    const { destination } = await startCodeSignIn(phoneE164)
    setSentTo(destination || maskPhone(phoneE164))
    setCooldown(RESEND_SECONDS)
    return { nextStep: CODE_VERIFY }
  }
  const submitPhone = (e) => {
    e.preventDefault()
    setTouched({ phone: true })
    if (phoneErr) return
    run(sendCode, () => { setCode(''); setTouched({}); setStep(CODE_VERIFY) })
  }
  const resendCode = async () => {
    if (cooldown > 0) return
    setResending(true)
    setError('')
    try {
      await sendCode()
    } catch (err) {
      setError(authErrorMessage(err, 'Couldn’t send a new code. Try again.'))
    } finally {
      setResending(false)
    }
  }
  const submitTextedCode = (e) => {
    e.preventDefault()
    setTouched({ code: true })
    if (codeErr) return
    run(() => confirmCodeSignIn({ code, remember }))
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

  const [title, defaultLead] = TITLES[step]
  const lead = step === CODE_VERIFY ? `We texted a 6-digit code to ${sentTo}.` : defaultLead
  const lockedHint = throttle.locked ? `Too many attempts. Try again in ${throttle.lockedFor}s.` : undefined
  const rememberBox = (
    <label className="auth-check">
      <input type="checkbox" checked={remember} onChange={(e) => setRemember(e.target.checked)} />
      Remember me
    </label>
  )

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
        <>
          <SegmentedControl label="Sign-in method" options={methodsHere()} value={method} block
            onChange={(m) => { setMethod(m); setError(''); setTouched({}) }} />

          {method === 'passkey' && (
            <form className="ui-form" onSubmit={submitPasskey} noValidate>
              <Field label="Email, phone or username" required error={touched.identifier ? idErr || undefined : undefined}
                hint="Use the passkey you added in Settings on this or another device.">
                <Input ref={firstField} autoComplete="username webauthn" autoCapitalize="none" spellCheck={false} value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setError('') }}
                  onBlur={() => setTouched((t) => ({ ...t, identifier: true }))} placeholder="name@example.com" />
              </Field>
              <div className="auth-row">{rememberBox}</div>
              <Button type="submit" variant="primary" block icon={KeyRound} loading={submitting} loadingText="Waiting for your passkey…"
                disabled={throttle.locked} hint={lockedHint}>
                Sign in with passkey
              </Button>
            </form>
          )}

          {method === 'password' && (
            <form className="ui-form" onSubmit={submitSignIn} noValidate>
              <Field label="Email, phone or username" required error={touched.identifier ? idErr || undefined : undefined}>
                <Input ref={firstField} autoComplete="username" autoCapitalize="none" spellCheck={false} value={identifier}
                  onChange={(e) => { setIdentifier(e.target.value); setError('') }}
                  onBlur={() => setTouched((t) => ({ ...t, identifier: true }))} placeholder="name@example.com" />
              </Field>
              <Field label="Password" required error={touched.password ? passwordErr : undefined}>
                <PasswordInput autoComplete="current-password" value={password}
                  onChange={(e) => { setPassword(e.target.value); setError('') }} onBlur={() => setTouched((t) => ({ ...t, password: true }))} />
              </Field>
              <div className="auth-row">
                {rememberBox}
                <Link className="auth-link" to="/forgot-password" state={{ identifier: identifier.trim() }}>Forgot password?</Link>
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

          {method === 'code' && (
            <form className="ui-form" onSubmit={submitPhone} noValidate>
              <Field label="Phone number" required error={touched.phone ? phoneErr || undefined : undefined}
                hint="The number on your account. We’ll text you a 6-digit code.">
                <Input ref={firstField} type="tel" autoComplete="tel" inputMode="tel" value={phone}
                  onChange={(e) => { setPhone(e.target.value); setError('') }}
                  onBlur={() => setTouched((t) => ({ ...t, phone: true }))} placeholder="+91 98765 43210" />
              </Field>
              <div className="auth-row">{rememberBox}</div>
              <Button type="submit" variant="primary" block loading={submitting} loadingText="Sending code…"
                disabled={throttle.locked} hint={lockedHint}>
                Send code
              </Button>
            </form>
          )}
        </>
      )}

      {step === CODE_VERIFY && (
        <form className="ui-form" onSubmit={submitTextedCode} noValidate>
          <Field label="6-digit code" required error={touched.code ? codeErr : undefined}>
            <CodeInput ref={firstField} value={code} onChange={(v) => { setCode(v); setError('') }} />
          </Field>
          <Button type="submit" variant="primary" block loading={submitting} loadingText="Verifying…"
            disabled={throttle.locked} hint={lockedHint}>
            Verify and sign in
          </Button>
          <Button variant="ghost" block onClick={resendCode} loading={resending} loadingText="Sending…" disabled={cooldown > 0}
            hint={cooldown > 0 ? `You can request another code in ${cooldown}s.` : undefined}>
            {cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}
          </Button>
          <Button variant="ghost" block onClick={() => { cancelPendingSignIn(); setError(''); setStep('signin') }}>
            Use a different number
          </Button>
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
