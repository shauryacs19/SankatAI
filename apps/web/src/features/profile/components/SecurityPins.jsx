// Security PINs — account-level PINs used to password-protect files. Users can
// keep one default PIN or create several. Values are never shown; the backend
// stores only PBKDF2 hashes. Rendered inside the Profile tab.

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Lock, Trash2, Plus, AlertTriangle, X } from 'lucide-react'
import { listPins, deletePin } from '../../../services/securityApi'
import CreatePinModal from './CreatePinModal'

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SecurityPins() {
  const [pins, setPins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [addOpen, setAddOpen] = useState(false)

  // deleting a PIN requires entering that PIN
  const [delTarget, setDelTarget] = useState(null)
  const [delPin, setDelPin] = useState('')
  const [delErr, setDelErr] = useState('')
  const [delBusy, setDelBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const l = await listPins(); setPins(Array.isArray(l) ? l : []) } catch (e) { setError(e.message || 'Could not load PINs.') } finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openAdd = () => setAddOpen(true)

  const openRemove = (p) => { setDelTarget(p); setDelPin(''); setDelErr('') }
  const submitRemove = async (e) => {
    e.preventDefault()
    if (delPin.length !== 6 || delBusy) return
    setDelBusy(true); setDelErr('')
    try {
      await deletePin(delTarget.id, delPin)
      setPins((prev) => prev.filter((x) => x.id !== delTarget.id))
      setDelTarget(null)
    } catch (err) {
      setDelErr(/403|incorrect/i.test(err.message || '') ? 'Incorrect PIN.' : (err.message || 'Could not delete the PIN.'))
    } finally { setDelBusy(false) }
  }

  return (
    <section className="dx-card">
      <div className="dx-card-title"><ShieldCheck size={15} /> Security PINs</div>
      <p className="sp-sub">Create PINs to password-protect files. When uploading, choose which PIN to use.</p>

      {error && <p className="sp-err"><AlertTriangle size={13} /> {error}</p>}

      {loading ? (
        <p className="dx-empty">Loading…</p>
      ) : pins.length === 0 ? (
        <p className="dx-empty">No PINs yet. Add one to start protecting files.</p>
      ) : (
        <div className="sp-list">
          {pins.map((p) => (
            <div key={p.id} className="sp-row">
              <span className="sp-ic"><Lock size={15} /></span>
              <div className="sp-info">
                <span className="sp-label">{p.label}</span>
                {p.createdAt && <span className="sp-date">Created {fmtDate(p.createdAt)}</span>}
              </div>
              <button type="button" className="sp-del" aria-label={`Delete ${p.label}`} onClick={() => openRemove(p)}><Trash2 size={14} /></button>
            </div>
          ))}
        </div>
      )}

      <button type="button" className="dx-setting-btn" onClick={openAdd}><Plus size={15} /> Add PIN</button>

      {delTarget && (
        <div className="dx-modal-scrim" onClick={() => !delBusy && setDelTarget(null)}>
          <form className="dx-modal" onClick={(e) => e.stopPropagation()} onSubmit={submitRemove}>
            <div className="dx-modal-head"><span><Trash2 size={15} /> Delete “{delTarget.label}”</span><button type="button" className="db-icon-ghost" onClick={() => setDelTarget(null)}><X size={16} /></button></div>
            <p className="dx-modal-desc">Enter this PIN to delete it. Files protected with it must be moved first.</p>
            <input
              className={`dx-modal-input ${delErr ? 'invalid' : ''}`}
              type="password" inputMode="numeric" autoComplete="off" placeholder="••••••"
              value={delPin} maxLength={6} autoFocus
              onChange={(e) => { setDelPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setDelErr('') }}
              style={{ letterSpacing: '0.3em' }}
            />
            {delErr && <span className="dx-modal-err">{delErr}</span>}
            <div className="dx-modal-actions">
              <button type="button" className="dx-mbtn ghost" onClick={() => setDelTarget(null)} disabled={delBusy}>Cancel</button>
              <button type="submit" className="dx-mbtn primary" disabled={delPin.length !== 6 || delBusy}>{delBusy ? 'Deleting…' : <><Trash2 size={15} /> Delete PIN</>}</button>
            </div>
          </form>
        </div>
      )}

      <CreatePinModal
        open={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(created) => { setPins((prev) => [...prev, created]); setAddOpen(false) }}
      />
    </section>
  )
}
