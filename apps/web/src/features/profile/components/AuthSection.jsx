// Account details, password change and sign out (inside Settings). Password
// changes go straight to Cognito from the client.

import { useState } from 'react'
import { KeyRound, Mail, ShieldCheck, LogOut, Lock } from 'lucide-react'
import { changePassword } from '../../../services/auth/cognito'
import { useAuth } from '../../../context/AuthContext.jsx'
import { Alert, Button, Card, Field, InfoRow, Input } from '../../../components/ui'
import { errText } from '../../../utils/errText'

const MIN_LEN = 8

export default function AuthSection({ profile, onSignOut }) {
  const { user } = useAuth() || {}
  const email = profile?.email || user?.email || ''

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [touched, setTouched] = useState({})
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const tooShort = next.length > 0 && next.length < MIN_LEN
  const mismatch = confirm.length > 0 && next !== confirm
  const canSave = Boolean(email) && current && next.length >= MIN_LEN && next === confirm && !busy
  const why = !email ? 'Your account email is still loading.' : !current ? 'Enter your current password.' : next.length < MIN_LEN ? `Choose a new password of at least ${MIN_LEN} characters.` : next !== confirm ? 'Confirm the new password.' : undefined
  const touch = (k) => () => setTouched((t) => ({ ...t, [k]: true }))
  const edit = (setter) => (e) => { setter(e.target.value); setError(''); setDone(false) }

  const submit = async (e) => {
    e.preventDefault()
    setTouched({ current: true, next: true, confirm: true })
    if (!canSave) return
    setBusy(true); setError(''); setDone(false)
    try {
      await changePassword(email, current, next)
      setCurrent(''); setNext(''); setConfirm(''); setTouched({}); setDone(true)
    } catch (err) {
      setError(errText(err, 'Could not change your password.'))
    } finally { setBusy(false) }
  }

  return (
    <>
      <Card title="Account" icon={ShieldCheck}>
        <div className="ui-rows">
          <InfoRow icon={Mail} label="Email" value={email} />
          <InfoRow icon={Lock} label="Sign-in method" value="Email and password" />
        </div>
        <p className="ui-hint">Your password is managed by Amazon Cognito. SankatAI never stores it.</p>
      </Card>

      <Card title="Change password" icon={KeyRound}>
        <form className="ui-form" onSubmit={submit} noValidate>
          <Field label="Current password" required error={touched.current && !current ? 'Enter your current password.' : undefined}>
            <Input type="password" autoComplete="current-password" value={current} onChange={edit(setCurrent)} onBlur={touch('current')} />
          </Field>
          <Field label="New password" required hint={`At least ${MIN_LEN} characters.`} error={(touched.next || next.length >= MIN_LEN) && tooShort ? `Use at least ${MIN_LEN} characters.` : undefined}>
            <Input type="password" autoComplete="new-password" value={next} onChange={edit(setNext)} onBlur={touch('next')} />
          </Field>
          <Field label="Confirm new password" required error={(touched.confirm || confirm.length >= next.length) && mismatch ? 'The passwords don’t match.' : undefined}>
            <Input type="password" autoComplete="new-password" value={confirm} onChange={edit(setConfirm)} onBlur={touch('confirm')} />
          </Field>

          {error && <Alert tone="danger">{error}</Alert>}
          {done && <Alert tone="success">Password updated.</Alert>}

          <div className="ui-form-actions">
            <Button type="submit" variant="primary" loading={busy} loadingText="Updating password…" disabled={!canSave} hint={busy ? undefined : why}>Update password</Button>
          </div>
        </form>
      </Card>

      <Card title="Session" icon={LogOut} description="Signing out ends the session on this device. Your data stays in your account.">
        <Button
          variant="secondary"
          icon={LogOut}
          loading={signingOut}
          loadingText="Signing out…"
          onClick={async () => { setSigningOut(true); await onSignOut() }}
        >
          Sign out
        </Button>
      </Card>
    </>
  )
}
