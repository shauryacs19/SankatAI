// Create-PIN modal, extracted from SecurityPins so the Documents upload form can
// reuse the exact same popup. Values are never shown; the backend stores only
// PBKDF2 hashes. `onCreated(pin)` fires with the created record.

import { useState } from 'react'
import { ShieldCheck, X, Check } from 'lucide-react'
import { createPin } from '../../../services/securityApi'

export default function CreatePinModal({ open, onClose, onCreated }) {
  const [label, setLabel] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  if (!open) return null

  const mismatch = confirm.length === 6 && pin.length === 6 && pin !== confirm
  const canSave = pin.length === 6 && confirm.length === 6 && pin === confirm && !saving
  const close = () => { if (saving) return; setLabel(''); setPin(''); setConfirm(''); setFormErr(''); onClose?.() }

  const submit = async (e) => {
    e.preventDefault()
    if (!canSave) return
    setSaving(true); setFormErr('')
    try {
      const created = await createPin({ pin, label: label.trim() || null })
      setLabel(''); setPin(''); setConfirm('')
      onCreated?.(created)
    } catch (err) {
      setFormErr(err.message || 'Could not create the PIN.')
    } finally { setSaving(false) }
  }

  return (
    <div className="dx-modal-scrim" onClick={close}>
      <form className="dx-modal" onClick={(e) => e.stopPropagation()} onSubmit={submit}>
        <div className="dx-modal-head"><span><ShieldCheck size={15} /> New security PIN</span><button type="button" className="db-icon-ghost" onClick={close}><X size={16} /></button></div>
        <label className="dx-modal-label">Label <span className="dx-modal-hint">(optional)</span></label>
        <input className="dx-modal-input" value={label} maxLength={40} placeholder="e.g. Personal, Reports" onChange={(e) => setLabel(e.target.value)} />
        <label className="dx-modal-label">Enter 6-digit PIN</label>
        <input className="dx-modal-input" type="password" inputMode="numeric" autoComplete="off" placeholder="••••••" value={pin} maxLength={6} autoFocus onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))} style={{ letterSpacing: '0.3em' }} />
        <label className="dx-modal-label">Confirm PIN</label>
        <input className={`dx-modal-input ${mismatch ? 'invalid' : ''}`} type="password" inputMode="numeric" autoComplete="off" placeholder="••••••" value={confirm} maxLength={6} onChange={(e) => setConfirm(e.target.value.replace(/\D/g, '').slice(0, 6))} style={{ letterSpacing: '0.3em' }} />
        {mismatch && <span className="dx-modal-err">PINs do not match.</span>}
        {formErr && <span className="dx-modal-err">{formErr}</span>}
        <div className="dx-modal-actions">
          <button type="button" className="dx-mbtn ghost" onClick={close} disabled={saving}>Cancel</button>
          <button type="submit" className="dx-mbtn primary" disabled={!canSave}>{saving ? 'Saving…' : <><Check size={15} /> Create PIN</>}</button>
        </div>
      </form>
    </div>
  )
}
