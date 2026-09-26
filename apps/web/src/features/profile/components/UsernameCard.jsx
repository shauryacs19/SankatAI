// Choose or change the account username (Cognito preferred_username). Cognito
// keeps usernames unique; a taken one comes back as AliasExistsException.
import { useState } from 'react'
import { AtSign } from 'lucide-react'
import { normalizeUsername, usernameError, USERNAME_MAX } from '@sankatai/shared'
import { updateUsername } from '../../../services/auth/cognito'
import { authErrorMessage } from '../../../services/auth/authErrors'
import { useAuth } from '../../../context/AuthContext.jsx'
import { Alert, Button, Card, Field, Input } from '../../../components/ui'

export default function UsernameCard() {
  const { user, setSignedIn } = useAuth()
  const current = user?.username || ''
  const [value, setValue] = useState(current)
  const [touched, setTouched] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const formatErr = usernameError(value)
  const unchanged = normalizeUsername(value) === current

  const submit = async (e) => {
    e.preventDefault()
    setTouched(true)
    if (formatErr || unchanged) return
    setBusy(true); setError(''); setDone(false)
    try {
      setSignedIn(await updateUsername(value))
      setTouched(false)
      setDone(true)
    } catch (err) {
      setError(err?.code === 'AliasExistsException'
        ? 'That username is taken. Try another.'
        : authErrorMessage(err, 'Couldn’t save your username. Try again.'))
    } finally { setBusy(false) }
  }

  return (
    <Card title="Username" icon={AtSign}
      description={current ? 'You can sign in with your username, email or phone number.' : 'Choose a username. You can sign in with it instead of your email or phone.'}>
      <form className="ui-form" onSubmit={submit} noValidate>
        <Field label="Username" required error={touched ? formatErr || undefined : undefined}
          hint="Letters, numbers, dots and underscores; it must start with a letter.">
          <Input autoComplete="username" autoCapitalize="none" spellCheck={false} maxLength={USERNAME_MAX} value={value}
            onChange={(e) => { setValue(e.target.value); setError(''); setDone(false) }} onBlur={() => setTouched(true)} />
        </Field>
        {error && <Alert tone="danger">{error}</Alert>}
        {done && <Alert tone="success">Username saved.</Alert>}
        <div className="ui-form-actions">
          <Button type="submit" variant="primary" loading={busy} loadingText="Saving…" disabled={unchanged}
            hint={unchanged ? 'Type a different username to save.' : undefined}>
            {current ? 'Change username' : 'Save username'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
