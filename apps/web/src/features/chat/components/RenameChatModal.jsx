import { useState } from 'react'
import { Pencil } from 'lucide-react'
import { Button, Field, Input, Modal } from '../../../components/ui'

// Rename a consultation. The form state resets each time the dialog opens
// because the inner form is keyed on the target.
export default function RenameChatModal({ target, onClose, onRename }) {
  return (
    <Modal open={Boolean(target)} onClose={onClose} title="Rename chat" icon={Pencil}>
      {target && <RenameForm key={target.id} target={target} onClose={onClose} onRename={onRename} />}
    </Modal>
  )
}

function RenameForm({ target, onClose, onRename }) {
  const [value, setValue] = useState(target.title)
  const [saving, setSaving] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    if (!value.trim() || saving) return
    setSaving(true)
    const ok = await onRename(target.id, value)
    setSaving(false)
    if (ok) onClose()
  }
  return (
    <form onSubmit={submit} noValidate className="ui-form">
      <Field label="Chat name">
        <Input value={value} maxLength={120} autoFocus onChange={(e) => setValue(e.target.value)} placeholder="e.g. Fever in March" />
      </Field>
      <div className="ui-form-actions">
        <Button variant="secondary" onClick={onClose} disabled={saving}>Cancel</Button>
        <Button type="submit" variant="primary" loading={saving} loadingText="Saving…" disabled={!value.trim()} hint={!value.trim() ? 'Enter a name first.' : undefined}>Save</Button>
      </div>
    </form>
  )
}
