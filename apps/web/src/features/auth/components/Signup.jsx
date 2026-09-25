import { useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { isEmail } from '@sankatai/shared'
import { signUp } from '../../../services/auth/cognito'
import { authErrorMessage, passwordOk, safeReturnTo } from '../../../services/auth/authErrors'
import { Alert, Button, Field, Input } from '../../../components/ui'
import { AuthLayout, PasswordChecklist, PasswordInput } from './AuthLayout.jsx'

export default function Signup() {
  const navigate = useNavigate()
  const location = useLocation()
  const returnTo = safeReturnTo(location.state?.returnTo)
  const [form, setForm] = useState({ name: '', email: '', password: '', confirm: '', terms: false })
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

  const errors = {
    name: !form.name.trim() ? 'Enter your name.' : '',
    email: !form.email.trim() ? 'Enter your email address.' : !isEmail(form.email.trim()) ? 'Enter a valid email address, like name@example.com.' : '',
    password: !passwordOk(form.password) ? 'Choose a password that meets every requirement.' : '',
    confirm: form.confirm !== form.password || !form.confirm ? 'The passwords don’t match.' : '',
    terms: !form.terms ? 'Accept the terms to continue.' : '',
  }

  const submit = async (e) => {
    e.preventDefault()
    setTouched({ name: true, email: true, password: true, confirm: true, terms: true })
    if (Object.values(errors).some(Boolean)) return
    setSubmitting(true)
    setError('')
    try {
      await signUp({ email: form.email, password: form.password, name: form.name })
      navigate('/verify', { state: { email: form.email.trim().toLowerCase(), returnTo } })
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
      <form className="ui-form" onSubmit={submit} noValidate>
        <Field label="Full name" required error={err('name')}>
          <Input ref={first} autoComplete="name" value={form.name} onChange={set('name')} onBlur={touch('name')} />
        </Field>
        <Field label="Email" required error={err('email')}>
          <Input type="email" autoComplete="email" inputMode="email" value={form.email} onChange={set('email')}
            onBlur={touch('email')} placeholder="name@example.com" />
        </Field>
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
