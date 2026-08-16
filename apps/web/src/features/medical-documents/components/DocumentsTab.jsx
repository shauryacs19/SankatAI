// File Storage (permanent vault) tab.
// Files are grouped under category headings (collapsible sections). Create a
// category and it appears as a heading; assign files to it via Edit and they
// group beneath it. Uncategorized files fall under a final "Uncategorized"
// section.
//
// - Clicking a row VIEWS the file (opens inline in a new tab); protected files
//   prompt for a passcode first.
// - Per-row actions: download (PIN-gated for protected), edit (rename + set
//   category), and a type-"confirm" delete.
// The backend enforces ownership from the Cognito token and mints fresh URLs.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, Image as ImageIcon, FileText, FolderOpen, Folder, Trash2, RefreshCw,
  AlertTriangle, Lock, Download, Pencil, X, Check, Plus, LayoutGrid, List,
} from 'lucide-react'
import { listUploads, deleteUpload, updateUpload, getDownloadUrl } from '../../../services/uploads'
import { listPins } from '../../../services/securityApi'
import {
  typeLabel, fmtDate, fmtFileSize as fmtSize, mergeCategories,
  VIEW_STORAGE_KEY, DEFAULT_DOC_VIEW, normalizeDocView, nextDocView,
  readProfileCategories, addProfileCategory, renameProfileCategory, removeProfileCategory,
  isDeleteConfirmed, DELETE_CONFIRM_TEXT,
} from '@sankatai/shared'
import { useProfile } from '../../profile/context/ProfileContext.jsx'
import { saveProfile } from '../../profile/services/profileApi'

// UI preference only — never tokens (see CLAUDE.md auth invariants).
const loadView = () => { try { return normalizeDocView(localStorage.getItem(VIEW_STORAGE_KEY)) } catch { return DEFAULT_DOC_VIEW } }
const saveView = (v) => { try { localStorage.setItem(VIEW_STORAGE_KEY, v) } catch { /* ignore */ } }

const openInTab = (url) => { if (url) window.open(url, '_blank', 'noopener') }

export default function DocumentsTab() {
  const navigate = useNavigate()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [pins, setPins] = useState([])
  const pinLabel = (f) => pins.find((p) => p.id === f.pinId)?.label || 'PIN'

  // Custom categories live on the profile so web + mobile stay in sync.
  const { profile, loading: profileLoading, setProfile } = useProfile()
  const customCats = readProfileCategories(profile)
  // Profile PUT replaces the whole record — always merge over the current profile,
  // and never write while it is still loading (that would blank the user's data).
  const persistCats = useCallback(async (next) => {
    if (profileLoading) { setError('Still loading your profile — try again in a moment.'); return }
    const prev = profile
    const merged = { ...(profile || {}), fileCategories: next }
    setProfile(merged)
    try { await saveProfile(merged) }
    catch (err) { setProfile(prev); setError(err.message || 'Could not save the category.') }
  }, [profile, profileLoading, setProfile])
  const [dragOverKey, setDragOverKey] = useState(null)
  const [view, setView] = useState(loadView)
  const toggleView = () => setView((v) => { const n = nextDocView(v); saveView(n); return n })

  // rename a category (renames it on every file under it)
  const [catEditTarget, setCatEditTarget] = useState(null)
  const [catEditName, setCatEditName] = useState('')
  const [catEditBusy, setCatEditBusy] = useState(false)

  const [pinModal, setPinModal] = useState(null) // { file, action }
  const [pin, setPin] = useState('')
  const [pinError, setPinError] = useState('')
  const [pinBusy, setPinBusy] = useState(false)

  const [editTarget, setEditTarget] = useState(null)
  const [editName, setEditName] = useState('')
  const [editCat, setEditCat] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  const [newCatOpen, setNewCatOpen] = useState(false)
  const [newCatName, setNewCatName] = useState('')

  const [deleteTarget, setDeleteTarget] = useState(null)
  const [deleteText, setDeleteText] = useState('')
  const [deleteBusy, setDeleteBusy] = useState(false)
  const [deletePin, setDeletePin] = useState('')
  const [deletePinDone, setDeletePinDone] = useState(false)
  const [deleteErr, setDeleteErr] = useState('')

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try {
      const list = await listUploads('vault')
      setFiles(Array.isArray(list) ? list : [])
    } catch (e) {
      setError(e.message || 'Could not load your files.')
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { listPins().then((l) => setPins(Array.isArray(l) ? l : [])).catch(() => {}) }, [])

  const categories = useMemo(() => mergeCategories(files, customCats), [files, customCats])

  const uncategorized = useMemo(() => files.filter((f) => !f.category), [files])

  const addCustomCat = (name) => {
    const next = addProfileCategory(customCats, name)
    if (next !== customCats) persistCats(next)
  }
  const removeCustomCat = (name, e) => {
    e.stopPropagation()
    persistCats(removeProfileCategory(customCats, name))
  }
  // --- view / download ---
  const doOpen = async (f, pinValue, disposition) => {
    const r = await getDownloadUrl(f.attachmentId, pinValue, disposition)
    openInTab(r.downloadUrl)
  }
  const act = async (f, action, e) => {
    if (e) e.stopPropagation()
    const disposition = action === 'view' ? 'inline' : 'attachment'
    if (f.passwordProtected) { setPinModal({ file: f, action }); setPin(''); setPinError(''); return }
    setBusyId(f.attachmentId)
    try { await doOpen(f, null, disposition) } catch (err) { setError(err.message || 'Could not open the file.') } finally { setBusyId(null) }
  }
  const submitPin = async (e) => {
    e.preventDefault()
    if (pin.length !== 6 || pinBusy) return
    setPinBusy(true); setPinError('')
    try {
      await doOpen(pinModal.file, pin, pinModal.action === 'view' ? 'inline' : 'attachment')
      setPinModal(null); setPin('')
    } catch (err) {
      setPinError(/403|incorrect|forbidden/i.test(err.message || '') ? 'Incorrect passcode.' : (err.message || 'Could not open the file.'))
    } finally { setPinBusy(false) }
  }

  // --- edit ---
  const openEdit = (f, e) => { e.stopPropagation(); setEditTarget(f); setEditName(f.filename || ''); setEditCat(f.category || '') }
  const submitEdit = async (e) => {
    e.preventDefault()
    const name = editName.trim()
    if (!name || editBusy) return
    const category = editCat.trim()
    setEditBusy(true)
    try {
      const updated = await updateUpload(editTarget.attachmentId, { filename: name, category })
      if (category) addCustomCat(category)
      setFiles((prev) => prev.map((x) => (x.attachmentId === editTarget.attachmentId
        ? { ...x, filename: updated?.filename || name, category: updated?.category ?? (category || null) }
        : x)))
      setEditTarget(null)
    } catch (err) {
      setError(err.message || 'Could not update the file.')
    } finally { setEditBusy(false) }
  }

  const submitNewCat = (e) => {
    e.preventDefault()
    const n = newCatName.trim()
    if (!n) return
    addCustomCat(n)
    setNewCatOpen(false); setNewCatName('')
  }

  // --- move a file to a category (drag & drop) ---
  const moveFileToCategory = async (attachmentId, category) => {
    const f = files.find((x) => x.attachmentId === attachmentId)
    if (!f || (f.category || '') === (category || '')) return
    const prevCat = f.category || null
    // optimistic
    setFiles((prev) => prev.map((x) => (x.attachmentId === attachmentId ? { ...x, category: category || null } : x)))
    try {
      await updateUpload(attachmentId, { category: category || '' })
      if (category) addCustomCat(category)
    } catch (err) {
      setFiles((prev) => prev.map((x) => (x.attachmentId === attachmentId ? { ...x, category: prevCat } : x)))
      setError(err.message || 'Could not move the file.')
    }
  }
  const onRowDragStart = (f, e) => { e.dataTransfer.setData('text/plain', f.attachmentId); e.dataTransfer.effectAllowed = 'move' }
  const onSectionDrop = (category, e) => {
    e.preventDefault()
    const id = e.dataTransfer.getData('text/plain')
    setDragOverKey(null)
    if (id) moveFileToCategory(id, category)
  }

  // --- rename a category ---
  const openCatEdit = (cat, e) => { e.stopPropagation(); setCatEditTarget(cat); setCatEditName(cat) }
  const submitCatRename = async (e) => {
    e.preventDefault()
    const oldName = catEditTarget
    const newName = catEditName.trim().slice(0, 60)
    if (!newName || newName === oldName || catEditBusy) return
    setCatEditBusy(true)
    try {
      const affected = files.filter((f) => f.category === oldName)
      await Promise.all(affected.map((f) => updateUpload(f.attachmentId, { category: newName })))
      await persistCats(renameProfileCategory(customCats, oldName, newName))
      setFiles((prev) => prev.map((f) => (f.category === oldName ? { ...f, category: newName } : f)))
      setCatEditTarget(null)
    } catch (err) {
      setError(err.message || 'Could not rename the category.')
    } finally { setCatEditBusy(false) }
  }

  // --- delete ---
  // Protected files are gated: PIN step first, then the typed confirmation.
  // The PIN is verified server-side on the DELETE call (403 -> back to step 1).
  const openDelete = (f, e) => {
    e.stopPropagation()
    setDeleteTarget(f); setDeleteText(''); setDeletePin(''); setDeleteErr('')
    setDeletePinDone(!f.passwordProtected)
  }
  const closeDelete = () => { setDeleteTarget(null); setDeletePin(''); setDeleteErr('') }
  const submitDelete = async (e) => {
    e.preventDefault()
    if (!deletePinDone) { if (deletePin.length === 6) { setDeleteErr(''); setDeletePinDone(true) } return }
    if (!isDeleteConfirmed(deleteText) || deleteBusy) return
    setDeleteBusy(true); setDeleteErr('')
    try {
      await deleteUpload(deleteTarget.attachmentId, deleteTarget.passwordProtected ? deletePin : null)
      setFiles((prev) => prev.filter((x) => x.attachmentId !== deleteTarget.attachmentId))
      closeDelete()
    } catch (err) {
      if (/403|incorrect pin/i.test(err.message || '')) {
        setDeletePin(''); setDeletePinDone(false); setDeleteErr('Incorrect PIN. Please try again.')
      } else setError(err.message || 'Could not delete the file.')
    } finally { setDeleteBusy(false) }
  }
  const deleteReady = deletePinDone ? isDeleteConfirmed(deleteText) : deletePin.length === 6

  const renderRow = (f) => {
    const size = fmtSize(f.size)
    return (
      <div
        key={f.attachmentId}
        className="db-file-row"
        role="button"
        tabIndex={0}
        draggable
        onDragStart={(e) => onRowDragStart(f, e)}
        onClick={() => act(f, 'view')}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(f, 'view') } }}
        title={`View ${f.filename}`}
      >
        <span className="db-file-ic">{busyId === f.attachmentId ? <RefreshCw size={20} className="db-spin" /> : (f.kind === 'photo' ? <ImageIcon size={20} /> : <FileText size={20} />)}</span>
        <span className="db-file-main">
          <span className="db-file-name">{f.filename}</span>
          <span className="db-file-meta">
            <span className="db-file-type">{typeLabel(f.contentType)}</span>
            {f.createdAt && <><span className="db-file-dot">·</span>{fmtDate(f.createdAt)}</>}
            {size && <><span className="db-file-dot">·</span>{size}</>}
          </span>
        </span>
        {f.passwordProtected && (
          <span className="db-file-protbadge" title={`Protected with ${pinLabel(f)}`}><Lock size={13} /><span className="db-file-prottext">Password Protected · {pinLabel(f)}</span></span>
        )}
        <span className="db-file-actions">
          <button type="button" className="db-file-act" title="Download" aria-label="Download file" onClick={(e) => act(f, 'download', e)}><Download size={16} /></button>
          <button type="button" className="db-file-act" title="Edit" aria-label="Edit file" onClick={(e) => openEdit(f, e)}><Pencil size={16} /></button>
          <button type="button" className="db-file-act danger" title="Delete" aria-label="Delete file" onClick={(e) => openDelete(f, e)}><Trash2 size={16} /></button>
        </span>
      </div>
    )
  }

  const section = (key, heading, items, { removable = false, dropCategory = '' } = {}) => (
    <div
      key={key}
      className={`db-cat-group ${dragOverKey === key ? 'dragover' : ''}`}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverKey !== key) setDragOverKey(key) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverKey(null) }}
      onDrop={(e) => onSectionDrop(dropCategory, e)}
    >
      <div className="db-cat-head">
        <Folder size={15} className="db-cat-ficon" />
        <span className="db-cat-title">{heading}</span>
        <span className="db-cat-count">{items.length}</span>
        {removable && (
          <span className="db-cat-tools">
            <span className="db-cat-edit" role="button" aria-label="Rename category" title="Rename category" onClick={(e) => openCatEdit(heading, e)}><Pencil size={13} /></span>
            {items.length === 0 && (
              <span className="db-cat-remove" role="button" aria-label="Remove category" title="Remove category" onClick={(e) => removeCustomCat(heading, e)}><X size={14} /></span>
            )}
          </span>
        )}
      </div>
      {items.length ? <div className={`db-file-list ${view === 'grid' ? 'grid' : ''}`}>{items.map(renderRow)}</div>
        : <p className="db-cat-empty">Empty — drag files here or use a file’s Edit action to move it into this category.</p>}
    </div>
  )

  const nothing = files.length === 0 && categories.length === 0

  return (
    <div className="db-view scroll-view">
      <div className="db-docs">
        <div className="db-docs-head">
          <div>
            <h3>File Storage</h3>
            <p>Click a file to view it. Protected files require a passcode.</p>
          </div>
          <div className="db-docs-upload">
            <button
              className="dx-action ghost db-docs-btn"
              onClick={toggleView}
              title={view === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
              aria-label={view === 'grid' ? 'Switch to list view' : 'Switch to grid view'}
              aria-pressed={view === 'grid'}
            >
              {view === 'grid' ? <List size={15} /> : <LayoutGrid size={15} />}
            </button>
            <button className="dx-action ghost db-docs-btn" onClick={() => { setNewCatOpen(true); setNewCatName('') }} title="New category"><Plus size={15} /> Category</button>
            <button className="dx-action ghost db-docs-btn" onClick={load} title="Refresh" aria-label="Refresh" disabled={loading}><RefreshCw size={15} className={loading ? 'db-spin' : ''} /></button>
            <button className="dx-action danger db-docs-btn" onClick={() => navigate('/documents/upload')}><Upload size={15} /> Upload</button>
          </div>
        </div>

        {error && <div className="db-docs-error" role="alert"><AlertTriangle size={15} /> {error}</div>}

        {loading ? (
          <div className="db-docs-empty"><span className="db-docs-spinner" /><p>Loading your files…</p></div>
        ) : nothing ? (
          <div className="db-docs-empty"><FolderOpen size={34} /><p>No files uploaded yet.</p></div>
        ) : (
          <div className="db-cat-groups">
            {categories.map((cat) => section(`cat:${cat}`, cat, files.filter((f) => f.category === cat), { removable: true, dropCategory: cat }))}
            {uncategorized.length > 0 && section('uncat', 'Uncategorized', uncategorized, { dropCategory: '' })}
          </div>
        )}
      </div>

      {/* PIN modal */}
      {pinModal && (
        <div className="dx-modal-scrim" onClick={() => !pinBusy && setPinModal(null)}>
          <form className="dx-modal" onClick={(e) => e.stopPropagation()} onSubmit={submitPin}>
            <div className="dx-modal-head"><span><Lock size={15} /> Enter passcode</span><button type="button" className="db-icon-ghost" onClick={() => setPinModal(null)}><X size={16} /></button></div>
            <p className="dx-modal-desc">“{pinModal.file.filename}” is password-protected. Enter its 6-digit passcode to {pinModal.action === 'view' ? 'view' : 'download'} it.</p>
            <input
              className={`dx-modal-input ${pinError ? 'invalid' : ''}`}
              type="password" inputMode="numeric" autoComplete="off" placeholder="••••••"
              value={pin} maxLength={6} autoFocus
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, '').slice(0, 6)); setPinError('') }}
              style={{ letterSpacing: '0.3em', fontSize: '1.1rem' }}
            />
            {pinError && <span className="dx-modal-err">{pinError}</span>}
            <div className="dx-modal-actions">
              <button type="button" className="dx-mbtn ghost" onClick={() => setPinModal(null)} disabled={pinBusy}>Cancel</button>
              <button type="submit" className="dx-mbtn primary" disabled={pin.length !== 6 || pinBusy}>{pinBusy ? 'Verifying…' : (pinModal.action === 'view' ? 'View' : 'Download')}</button>
            </div>
          </form>
        </div>
      )}

      {/* Edit modal: rename + category */}
      {editTarget && (
        <div className="dx-modal-scrim" onClick={() => !editBusy && setEditTarget(null)}>
          <form className="dx-modal" onClick={(e) => e.stopPropagation()} onSubmit={submitEdit}>
            <div className="dx-modal-head"><span><Pencil size={15} /> Edit file</span><button type="button" className="db-icon-ghost" onClick={() => setEditTarget(null)}><X size={16} /></button></div>
            <label className="dx-modal-label">File name</label>
            <input className="dx-modal-input" value={editName} maxLength={120} autoFocus placeholder="File name" onChange={(e) => setEditName(e.target.value)} />
            <label className="dx-modal-label">Category <span className="dx-modal-hint">(leave blank for Uncategorized)</span></label>
            <input className="dx-modal-input" value={editCat} maxLength={60} list="db-cat-options" placeholder="e.g. Prescriptions" onChange={(e) => setEditCat(e.target.value)} />
            <datalist id="db-cat-options">{categories.map((c) => <option key={c} value={c} />)}</datalist>
            <div className="dx-modal-actions">
              <button type="button" className="dx-mbtn ghost" onClick={() => setEditTarget(null)} disabled={editBusy}>Cancel</button>
              <button type="submit" className="dx-mbtn primary" disabled={!editName.trim() || editBusy}>{editBusy ? 'Saving…' : <><Check size={15} /> Save</>}</button>
            </div>
          </form>
        </div>
      )}

      {/* New category modal */}
      {newCatOpen && (
        <div className="dx-modal-scrim" onClick={() => setNewCatOpen(false)}>
          <form className="dx-modal" onClick={(e) => e.stopPropagation()} onSubmit={submitNewCat}>
            <div className="dx-modal-head"><span><Plus size={15} /> New category</span><button type="button" className="db-icon-ghost" onClick={() => setNewCatOpen(false)}><X size={16} /></button></div>
            <input className="dx-modal-input" value={newCatName} maxLength={60} autoFocus placeholder="e.g. Prescriptions" onChange={(e) => setNewCatName(e.target.value)} />
            <div className="dx-modal-actions">
              <button type="button" className="dx-mbtn ghost" onClick={() => setNewCatOpen(false)}>Cancel</button>
              <button type="submit" className="dx-mbtn primary" disabled={!newCatName.trim()}><Check size={15} /> Create</button>
            </div>
          </form>
        </div>
      )}

      {/* Rename category */}
      {catEditTarget !== null && (
        <div className="dx-modal-scrim" onClick={() => !catEditBusy && setCatEditTarget(null)}>
          <form className="dx-modal" onClick={(e) => e.stopPropagation()} onSubmit={submitCatRename}>
            <div className="dx-modal-head"><span><Pencil size={15} /> Rename category</span><button type="button" className="db-icon-ghost" onClick={() => setCatEditTarget(null)}><X size={16} /></button></div>
            <p className="dx-modal-desc">Renaming updates every file currently under “{catEditTarget}”.</p>
            <input className="dx-modal-input" value={catEditName} maxLength={60} autoFocus placeholder="Category name" onChange={(e) => setCatEditName(e.target.value)} />
            <div className="dx-modal-actions">
              <button type="button" className="dx-mbtn ghost" onClick={() => setCatEditTarget(null)} disabled={catEditBusy}>Cancel</button>
              <button type="submit" className="dx-mbtn primary" disabled={!catEditName.trim() || catEditName.trim() === catEditTarget || catEditBusy}>{catEditBusy ? 'Saving…' : <><Check size={15} /> Save</>}</button>
            </div>
          </form>
        </div>
      )}

      {/* Delete confirmation — type "confirm" */}
      {deleteTarget && (
        <div className="dx-modal-scrim" onClick={() => !deleteBusy && closeDelete()}>
          <form className="dx-modal" onClick={(e) => e.stopPropagation()} onSubmit={submitDelete}>
            {!deletePinDone ? (
              <>
                <div className="dx-modal-head"><span><Lock size={15} /> Enter the PIN for this file</span></div>
                <p className="dx-modal-desc">This file is protected. Its 6-digit PIN is required before it can be deleted.</p>
                {!!deleteErr && <p className="dx-modal-err">{deleteErr}</p>}
                <input
                  className="dx-modal-input" value={deletePin} placeholder="••••••" autoFocus autoComplete="off"
                  inputMode="numeric" type="password" maxLength={6}
                  onChange={(e) => setDeletePin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  onKeyDown={(e) => { if (e.key === 'Escape') closeDelete() }}
                />
                <div className="dx-modal-actions">
                  <button type="button" className="dx-mbtn ghost" onClick={closeDelete}>Cancel</button>
                  <button type="submit" className="dx-mbtn primary" disabled={!deleteReady}>Continue</button>
                </div>
              </>
            ) : (
              <>
                <div className="dx-modal-head"><span><AlertTriangle size={15} /> Do you want to permanently delete this file?</span></div>
                <p className="dx-modal-desc">Files cannot be retrieved after deletion.</p>
                <label className="dx-modal-label">To confirm, type <b>{DELETE_CONFIRM_TEXT}</b> below</label>
                <input className="dx-modal-input" value={deleteText} placeholder={DELETE_CONFIRM_TEXT} autoFocus autoComplete="off" onChange={(e) => setDeleteText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Escape') closeDelete() }} />
                <div className="dx-modal-actions">
                  <button type="button" className="dx-mbtn ghost" onClick={closeDelete} disabled={deleteBusy}>Cancel</button>
                  <button type="submit" className="dx-mbtn primary" disabled={!deleteReady || deleteBusy}>{deleteBusy ? 'Deleting…' : <><Trash2 size={15} /> Delete</>}</button>
                </div>
              </>
            )}
          </form>
        </div>
      )}
    </div>
  )
}
