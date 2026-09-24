// Create-PIN dialog, shared by Security PINs (profile) and the document upload
// form. Values are never shown; the backend stores only PBKDF2 hashes.
// `onCreated(pin)` fires with the created record.

import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import { createPin } from '../../../services/securityApi'
import { Alert, Button, Field, Input, Modal, PinInput } from '../../../components/ui'

export default function CreatePinModal({ open, onClose, onCreated }) {
  const [label, setLabel] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [confirmTouched, setConfirmTouched] = useState(false)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  const mismatch = confirm.length > 0 && (confirmTouched || confirm.length === 6) && confirm !== pin
  const canSave = pin.length === 6 && confirm.length === 6 && pin === confirm && !saving
  const reset = () => { setLabel(''); setPin(''); setConfirm(''); setConfirmTouched(false); setFormErr('') }
  const close = () => { if (saving) return; reset(); onClose?.() }

  const submit = async () => {
    if (!canSave) return
    setSaving(true); setFormErr('')
    try {
      const created = await createPin({ pin, label: label.trim() || null })
      reset()
      onCreated?.(created)
    } catch (err) {
      setFormErr(err.message || 'Could not create the PIN. Please try again.')
    } finally { setSaving(false) }
  }

  const why = pin.length !== 6 ? 'Enter a 6-digit PIN.' : confirm.length !== 6 ? 'Re-enter the PIN to confirm it.' : pin !== confirm ? 'The two PINs must match.' : undefined

  return (
    <Modal
      open={open}
      onClose={close}
      busy={saving}
      icon={ShieldCheck}
      title="Create a security PIN"
      description="You'll need this PIN to open protected documents. It can't be shown again, so choose one you'll remember."
      onSubmit={submit}
      footer={(
        <>
          <Button variant="secondary" onClick={close} disabled={saving}>Cancel</Button>
          <Button type="submit" variant="primary" loading={saving} loadingText="Creating…" disabled={!canSave} hint={saving ? undefined : why}>Create PIN</Button>
        </>
      )}
    >
      <Field label="Label" optional hint="Helps you tell PINs apart, e.g. “Personal” or “Reports”.">
        <Input value={label} maxLength={40} onChange={(e) => setLabel(e.target.value)} />
      </Field>
      <Field label="6-digit PIN" required>
        <PinInput value={pin} autoFocus onChange={setPin} />
      </Field>
      <Field label="Confirm PIN" required error={mismatch ? "The PINs don't match." : undefined}>
        <PinInput value={confirm} onChange={setConfirm} onBlur={() => setConfirmTouched(true)} />
      </Field>
      {formErr && <Alert tone="danger">{formErr}</Alert>}
    </Modal>
  )
}
