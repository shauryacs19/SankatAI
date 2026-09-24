// Security PINs — account-level PINs used to protect documents. Values are
// never shown; the backend stores only PBKDF2 hashes. Deleting a PIN requires
// entering it (verified server-side).

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Lock, Trash2, Plus } from 'lucide-react'
import { fmtDate } from '@sankatai/shared'
import { listPins, deletePin } from '../../../services/securityApi'
import CreatePinModal from './CreatePinModal'
import { Button, Card, EmptyState, ErrorState, Field, IconButton, Modal, PinInput, Skeleton, useToast } from '../../../components/ui'

const CSS = `
.pin-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; }
.pin-ic { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: var(--radius-control); background: var(--surface-sunken); color: var(--text-secondary); flex-shrink: 0; }
.pin-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.pin-label { font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-medium); }
.pin-date { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
`

export default function SecurityPins() {
  const toast = useToast()
  const [pins, setPins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [addOpen, setAddOpen] = useState(false)

  const [delTarget, setDelTarget] = useState(null)
  const [delPin, setDelPin] = useState('')
  const [delErr, setDelErr] = useState('')
  const [delBusy, setDelBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const l = await listPins(); setPins(Array.isArray(l) ? l : []) } catch (e) { setError(e.message || 'Could not load your PINs.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openRemove = (p) => { setDelTarget(p); setDelPin(''); setDelErr('') }
  const submitRemove = async () => {
    if (delPin.length !== 6 || delBusy) return
    setDelBusy(true); setDelErr('')
    try {
      await deletePin(delTarget.id, delPin)
      setPins((prev) => prev.filter((x) => x.id !== delTarget.id))
      setDelTarget(null)
      toast.success('PIN deleted.')
    } catch (err) {
      setDelErr(/403|incorrect/i.test(err.message || '') ? 'That PIN is incorrect.' : (err.message || 'Could not delete the PIN.'))
    } finally { setDelBusy(false) }
  }

  return (
    <Card
      title="Security PINs"
      icon={ShieldCheck}
      description="Use a PIN to protect documents. You'll choose which PIN when you upload."
      actions={!loading && !error && pins.length > 0 ? <Button size="sm" variant="secondary" icon={Plus} onClick={() => setAddOpen(true)}>Add PIN</Button> : null}
    >
      <style>{CSS}</style>
      {loading ? (
        <div aria-busy="true"><span className="sr-only" role="status">Loading your PINs…</span><div className="pin-row"><Skeleton width="2.5rem" height="2.5rem" /><span className="pin-text"><Skeleton variant="text" width="40%" /></span></div></div>
      ) : error ? (
        <ErrorState compact headingLevel={3} title="Couldn't load your PINs" description={error} onRetry={load} />
      ) : pins.length === 0 ? (
        <EmptyState compact headingLevel={3} title="No PINs yet" description="Create a 6-digit PIN to start protecting sensitive documents." action={<Button variant="secondary" icon={Plus} onClick={() => setAddOpen(true)}>Create a PIN</Button>} />
      ) : (
        <ul role="list" className="ui-rows">
          {pins.map((p) => (
            <li key={p.id} className="pin-row">
              <span className="pin-ic"><Lock size={16} aria-hidden="true" /></span>
              <span className="pin-text">
                <span className="pin-label">{p.label}</span>
                {p.createdAt && <span className="pin-date">Created {fmtDate(p.createdAt)}</span>}
              </span>
              <IconButton label={`Delete PIN ${p.label}`} icon={Trash2} variant="danger" onClick={() => openRemove(p)} tooltipAlign="end" />
            </li>
          ))}
        </ul>
      )}

      <Modal
        open={Boolean(delTarget)}
        onClose={() => setDelTarget(null)}
        busy={delBusy}
        icon={Trash2}
        iconTone="danger"
        title={delTarget ? `Delete “${delTarget.label}”?` : ''}
        description="Enter this PIN to delete it. Documents protected with it must be moved to another PIN first."
        onSubmit={submitRemove}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setDelTarget(null)} disabled={delBusy}>Cancel</Button>
            <Button type="submit" variant="destructive" loading={delBusy} loadingText="Deleting…" disabled={delPin.length !== 6} hint={delPin.length !== 6 ? 'Enter all 6 digits.' : undefined}>Delete PIN</Button>
          </>
        )}
      >
        <Field label="PIN" error={delErr}>
          <PinInput value={delPin} autoFocus onChange={(v) => { setDelPin(v); setDelErr('') }} />
        </Field>
      </Modal>

      <CreatePinModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(created) => { setPins((prev) => [...prev, created]); setAddOpen(false); toast.success('PIN created.') }}
      />
    </Card>
  )
}
