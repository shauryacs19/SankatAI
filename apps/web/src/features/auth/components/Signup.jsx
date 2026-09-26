import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { isEmail, normalizeUsername, toE164, usernameError, USERNAME_MAX } from '@sankatai/shared'
import { signUp } from '../../../services/auth/cognito'
import { authErrorMessage, passwordOk, safeReturnTo } from '../../../services/auth/authErrors'
import { Alert, Button, Field, Input, SegmentedControl } from '../../../components/ui'
import { AuthLayout, PasswordChecklist, PasswordInput } from './AuthLayout.jsx'
import { SocialButtons } from './SocialButtons.jsx'
import { savePendingSignUp } from './authHooks'

const VIA = [
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
]

export default function Signup() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = safeReturnTo(location.state?.returnTo)
  const [via, setVia] = useState('email')
  const [form, setForm] = useState({ name: '', username: '', email: '', phone: '', password: '', confirm: '', terms: false })
  const [touched, setTouched] = useState({})
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const first = useRef(null)

  useEffect(() => { first.current?.focus() }, [])
  // Passwords are dropped with the page.
  useEffect(() => () => setForm((f) => ({ ...f, password: '', confirm: '' })), [])

  const set = (key) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value
    setForm((f) => ({ ...f, [key]: value }))
    setError('')
  }
  const touch = (key) => () => setTouched((t) => ({ ...t, [key]: true }))

  const phone = toE164(form.phone)
  const errors = {
    name: !form.name.trim() ? 'Enter your name.' : '',
    username: usernameError(form.username),
    email: via !== 'email' ? '' : !form.email.trim() ? 'Enter your email address.' : !isEmail(form.email.trim()) ? 'Enter a valid email address, like name@example.com.' : '',
    phone: via !== 'phone' ? '' : !form.phone.trim() ? 'Enter your phone number.' : !phone ? 'Enter a valid number, like 98765 43210 or +91 98765 43210.' : '',
    password: !passwordOk(form.password) ? 'Choose a password that meets every requirement.' : '',
    confirm: form.confirm !== form.password || !form.confirm ? 'The passwords don’t match.' : '',
    terms: !form.terms ? 'Accept the terms to continue.' : '',
  }

  const submit = async (e) => {
    e.preventDefault()
    setTouched({ name: true, username: true, email: true, phone: true, password: true, confirm: true, terms: true })
    if (Object.values(errors).some(Boolean)) return
    setSubmitting(true)
    setError('')
    try {
      const destination = via === 'email' ? form.email.trim().toLowerCase() : phone
      const { username } = await signUp({
        name: form.name, username: form.username, password: form.password,
        ...(via === 'email' ? { email: destination } : { phone: destination }),
      })
      const pending = { username, destination, via, handle: normalizeUsername(form.username) }
      savePendingSignUp(pending)
      navigate('/verify', { state: { ...pending, returnTo } })
    } catch (err) {
      setError(authErrorMessage(err, 'Couldn’t create your account. Try again.'))
    } finally {
      setSubmitting(false)
    }
  }

  const err = (key) => (touched[key] ? errors[key] || undefined : undefined)

  return (
    <AuthLayout
      title="Create your account"
      lead="Keep your health profile, chats and documents in one place."
      footer={<p>Already have an account? <Link className="auth-link" to="/login">Sign in</Link></p>}
    >
      {error && <Alert tone="danger">{error}</Alert>}
      <SocialButtons returnTo={returnTo} verb="Sign up" />
      <form className="ui-form" onSubmit={submit} noValidate>
        <Field label="Full name" required error={err('name')}>
          <Input ref={first} autoComplete="name" value={form.name} onChange={set('name')} onBlur={touch('name')} />
        </Field>
        <Field label="Username" required error={err('username')}
          hint="Letters, numbers, dots and underscores. You can sign in with it and change it later.">
          <Input autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={USERNAME_MAX} value={form.username}
            onChange={set('username')} onBlur={touch('username')} placeholder="asha.k" />
        </Field>
        <SegmentedControl label="Sign up with" options={VIA} value={via} block onChange={(v) => { setVia(v); setError('') }} />
        {via === 'email' ? (
          <Field label="Email" required error={err('email')}>
            <Input type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')}
              onBlur={touch('email')} placeholder="name@example.com" />
          </Field>
        ) : (
          <Field label="Phone number" required error={err('phone')} hint="We’ll text a code to verify it. You can then sign in with a texted code.">
            <Input type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={set('phone')}
              onBlur={touch('phone')} placeholder="+91 98765 43210" />
          </Field>
        )}
        <Field label="Password" required error={err('password')}>
          <PasswordInput autoComplete="new-password" value={form.password} onChange={set('password')}
            onBlur={touch('password')} aria-describedby="signup-pw-rules" />
        </Field>
        <PasswordChecklist password={form.password} id="signup-pw-rules" />
        <Field label="Confirm password" required error={err('confirm')}>
          <PasswordInput autoComplete="new-password" value={form.confirm} onChange={set('confirm')} onBlur={touch('confirm')} />
        </Field>
        <div className="ui-field">
          <label className="auth-check">
            <input type="checkbox" checked={form.terms} onChange={set('terms')} aria-invalid={err('terms') ? true : undefined}
              aria-describedby={err('terms') ? 'signup-terms-err' : undefined} />
            I understand SankatAI gives guidance, not a diagnosis, and I accept the terms of use.
          </label>
          {err('terms') && <p id="signup-terms-err" className="ui-field-error">{errors.terms}</p>}
        </div>
        <Button type="submit" variant="primary" block loading={submitting} loadingText="Creating your account…">
          Create account
        </Button>
      </form>
    </AuthLayout>
  )
}
