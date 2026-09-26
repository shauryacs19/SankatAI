// Passkeys on the account: add one on this device, see them all, remove one.
// Registration and listing go straight to Cognito with the access token.
import { useCallback, useEffect, useState } from 'react'
import { Fingerprint, Trash2 } from 'lucide-react'
import { addPasskey, listPasskeys, removePasskey } from '../../../services/auth/cognito'
import { passkeysSupported } from '../../../services/auth/webauthn'
import { authErrorMessage } from '../../../services/auth/authErrors'
import { Alert, Button, Card, ConfirmDialog, useToast } from '../../../components/ui'

const added = (createdAt) => {
  const ms = typeof createdAt === 'number' ? createdAt * 1000 : Date.parse(createdAt)
  return Number.isFinite(ms) ? new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : ''
}

export default function PasskeysCard() {
  const toast = useToast()
  const [items, setItems] = useState(null) // null while loading
  const [error, setError] = useState('')
  const [adding, setAdding] = useState(false)
  const [removing, setRemoving] = useState(null) // the passkey being confirmed
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    try {
      setItems(await listPasskeys())
    } catch (err) {
      setItems([])
      setError(authErrorMessage(err, 'Couldn’t load your passkeys.'))
    }
  }, [])

  useEffect(() => { if (passkeysSupported()) load() }, [load])

  if (!passkeysSupported()) return null

  const add = async () => {
    setAdding(true); setError('')
    try {
      await addPasskey()
      toast.success('Passkey added. You can now sign in with it.')
      await load()
    } catch (err) {
      setError(authErrorMessage(err, 'Couldn’t add a passkey. Try again.'))
    } finally { setAdding(false) }
  }

  const remove = async () => {
    setBusy(true)
    try {
      await removePasskey(removing.CredentialId)
      toast.success('Passkey removed.')
      setRemoving(null)
      await load()
    } catch (err) {
      toast.error(authErrorMessage(err, 'Couldn’t remove that passkey.'))
    } finally { setBusy(false) }
  }

  return (
    <Card title="Passkeys" icon={Fingerprint}
      description="Sign in with your fingerprint, face or device PIN instead of a password. A passkey works on this website only.">
      {error && <Alert tone="danger">{error}</Alert>}
      {items === null ? (
        <p className="ui-hint" role="status">Loading your passkeys…</p>
      ) : items.length === 0 ? (
        <p className="ui-hint">No passkeys yet.</p>
      ) : (
        <div className="ui-rows" role="list" aria-label="Your passkeys">
          {items.map((p) => (
            <div key={p.CredentialId} role="listitem" className="ui-info-row">
              <span>
                <strong>{p.FriendlyCredentialName || 'Passkey'}</strong>
                {added(p.CreatedAt) && <span className="ui-hint"> · added {added(p.CreatedAt)}</span>}
              </span>
              <Button variant="ghost" size="sm" icon={Trash2} onClick={() => setRemoving(p)}>Remove</Button>
            </div>
          ))}
        </div>
      )}
      <div className="ui-form-actions">
        <Button variant="secondary" icon={Fingerprint} onClick={add} loading={adding} loadingText="Waiting for your device…">
          Add a passkey
        </Button>
      </div>
      <ConfirmDialog
        open={Boolean(removing)}
        onClose={() => !busy && setRemoving(null)}
        onConfirm={remove}
        busy={busy}
        title="Remove this passkey?"
        description={`${removing?.FriendlyCredentialName || 'This passkey'} will no longer sign you in. Other ways to sign in keep working.`}
        confirmLabel="Remove"
        busyLabel="Removing…"
      />
    </Card>
  )
}
