// Documents (permanent vault). Files are grouped under category cards; custom
// categories live on the profile so web + mobile stay in sync.
//
// - Clicking a file VIEWS it (new tab); protected files ask for their PIN first.
// - Per-file actions: download (PIN-gated when protected), edit (rename + set
//   category), delete (PIN for protected files, then type "confirm").
// - Files can be dragged between category cards.
// The backend enforces ownership from the Cognito token and mints fresh URLs.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Upload, Image as ImageIcon, FileText, FolderOpen, Folder, Trash2, RefreshCw,
  Lock, Download, Pencil, X, Plus, LayoutGrid, List, MoreVertical,
} from 'lucide-react'
import { listUploads, deleteUpload, updateUpload, getDownloadUrl } from '../../../services/uploads'
import { listPins } from '../../../services/securityApi'
import {
  typeLabel, fmtDate, fmtFileSize as fmtSize, mergeCategories,
  VIEW_STORAGE_KEY, DEFAULT_DOC_VIEW, normalizeDocView,
  readProfileCategories, addProfileCategory, renameProfileCategory, removeProfileCategory,
  isDeleteConfirmed, DELETE_CONFIRM_TEXT,
} from '@sankatai/shared'
import { useProfile } from '../../profile/context/ProfileContext.jsx'
import { saveProfile } from '../../profile/services/profileApi'
import {
  Alert, Badge, Button, EmptyState, ErrorState, Field, IconButton, Input, Menu, Modal, PageHeader, PinInput,
  SegmentedControl, Skeleton, Spinner, useDelayedFlag, useToast,
} from '../../../components/ui'
import { DOCS_CSS } from './documents.styles'
import { errText } from '../../../utils/errText'

// UI preference only — never tokens (see CLAUDE.md auth invariants).
const loadView = () => { try { return normalizeDocView(localStorage.getItem(VIEW_STORAGE_KEY)) } catch { return DEFAULT_DOC_VIEW } }
const saveView = (v) => { try { localStorage.setItem(VIEW_STORAGE_KEY, v) } catch { /* ignore */ } }

const openInTab = (url) => { if (url) window.open(url, '_blank', 'noopener') }

export default function DocumentsTab() {
  const navigate = useNavigate()
  const toast = useToast()
  const [files, setFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [busyId, setBusyId] = useState(null)
  const [pins, setPins] = useState([])
  const pinLabel = (f) => pins.find((p) => p.id === f.pinId)?.label || 'a PIN'

  // Custom categories live on the profile so web + mobile stay in sync.
  const { profile, loading: profileLoading, setProfile } = useProfile()
  const customCats = readProfileCategories(profile)
  // Profile PUT replaces the whole record — always merge over the current profile,
  // and never write while it is still loading (that would blank the user's data).
  const persistCats = useCallback(async (next) => {
    if (profileLoading) { toast.info('Still loading your profile — try again in a moment.'); return false }
    const prev = profile
    const merged = { ...(profile || {}), fileCategories: next }
    setProfile(merged)
    try { await saveProfile(merged); return true }
    catch (err) { setProfile(prev); toast.error(errText(err, 'Could not save the category.')); return false }
  }, [profile, profileLoading, setProfile, toast])
  const [dragOverKey, setDragOverKey] = useState(null)
  const [view, setView] = useState(loadView)
  const changeView = (v) => { setView(v); saveView(v) }

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
    setLoading(true); setLoadError('')
    try {
      const list = await listUploads('vault')
      setFiles(Array.isArray(list) ? list : [])
    } catch (e) {
      setLoadError(errText(e, 'Could not load your documents.'))
    } finally {
      setLoading(false)
    }
  }, [])
  useEffect(() => { load() }, [load])
  useEffect(() => { listPins().then((l) => setPins(Array.isArray(l) ? l : [])).catch(() => {}) }, [])

  const showSkeleton = useDelayedFlag(loading)
  const categories = useMemo(() => mergeCategories(files, customCats), [files, customCats])
  const uncategorized = useMemo(() => files.filter((f) => !f.category), [files])

  const addCustomCat = (name) => {
    const next = addProfileCategory(customCats, name)
    if (next !== customCats) return persistCats(next)
    return Promise.resolve(true)
  }
  const removeCustomCat = (name) => persistCats(removeProfileCategory(customCats, name))

  // --- view / download ---
  const doOpen = async (f, pinValue, disposition) => {
    const r = await getDownloadUrl(f.attachmentId, pinValue, disposition)
    openInTab(r.downloadUrl)
  }
  const act = async (f, action) => {
    const disposition = action === 'view' ? 'inline' : 'attachment'
    if (f.passwordProtected) { setPinModal({ file: f, action }); setPin(''); setPinError(''); return }
    setBusyId(f.attachmentId)
    try { await doOpen(f, null, disposition) } catch (err) { toast.error(errText(err, `Could not open “${f.filename}”.`)) } finally { setBusyId(null) }
  }
  const submitPin = async () => {
    if (pin.length !== 6 || pinBusy) return
    setPinBusy(true); setPinError('')
    try {
      await doOpen(pinModal.file, pin, pinModal.action === 'view' ? 'inline' : 'attachment')
      setPinModal(null); setPin('')
    } catch (err) {
      setPinError(/403|incorrect|forbidden/i.test(errText(err, '')) ? 'That PIN is incorrect. Check it and try again.' : (errText(err, 'Could not open the file.')))
    } finally { setPinBusy(false) }
  }

  // --- edit ---
  const openEdit = (f) => { setEditTarget(f); setEditName(f.filename || ''); setEditCat(f.category || '') }
  const submitEdit = async () => {
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
      toast.success('Document updated.')
    } catch (err) {
      toast.error(errText(err, 'Could not update the document.'))
    } finally { setEditBusy(false) }
  }

  const submitNewCat = async () => {
    const n = newCatName.trim()
    if (!n) return
    const ok = await addCustomCat(n)
    if (ok) { setNewCatOpen(false); setNewCatName('') }
  }

  // --- move a file to a category (drag & drop) ---
  const moveFileToCategory = async (attachmentId, category) => {
    const f = files.find((x) => x.attachmentId === attachmentId)
    if (!f || (f.category || '') === (category || '')) return
    const prevCat = f.category || null
    setFiles((prev) => prev.map((x) => (x.attachmentId === attachmentId ? { ...x, category: category || null } : x)))
    try {
      await updateUpload(attachmentId, { category: category || '' })
      if (category) addCustomCat(category)
    } catch (err) {
      setFiles((prev) => prev.map((x) => (x.attachmentId === attachmentId ? { ...x, category: prevCat } : x)))
      toast.error(errText(err, 'Could not move the document.'))
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
  const openCatEdit = (cat) => { setCatEditTarget(cat); setCatEditName(cat) }
  const submitCatRename = async () => {
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
      toast.error(errText(err, 'Could not rename the category.'))
    } finally { setCatEditBusy(false) }
  }

  // --- delete ---
  // Protected files are gated: PIN step first, then the typed confirmation.
  // The PIN is verified server-side on the DELETE call (403 -> back to step 1).
  const openDelete = (f) => {
    setDeleteTarget(f); setDeleteText(''); setDeletePin(''); setDeleteErr('')
    setDeletePinDone(!f.passwordProtected)
  }
  const closeDelete = () => { if (deleteBusy) return; setDeleteTarget(null); setDeletePin(''); setDeleteErr('') }
  const submitDelete = async () => {
    if (!deletePinDone) { if (deletePin.length === 6) { setDeleteErr(''); setDeletePinDone(true) } return }
    if (!isDeleteConfirmed(deleteText) || deleteBusy) return
    setDeleteBusy(true); setDeleteErr('')
    try {
      await deleteUpload(deleteTarget.attachmentId, deleteTarget.passwordProtected ? deletePin : null)
      setFiles((prev) => prev.filter((x) => x.attachmentId !== deleteTarget.attachmentId))
      setDeleteTarget(null)
      toast.success('Document deleted.')
    } catch (err) {
      if (/403|incorrect pin/i.test(errText(err, ''))) {
        setDeletePin(''); setDeletePinDone(false); setDeleteErr('That PIN is incorrect. Please try again.')
      } else setDeleteErr(errText(err, 'Could not delete the document. Please try again.'))
    } finally { setDeleteBusy(false) }
  }
  const deleteReady = deletePinDone ? isDeleteConfirmed(deleteText) : deletePin.length === 6

  const renderFile = (f) => {
    const size = fmtSize(f.size)
    const busy = busyId === f.attachmentId
    const meta = [typeLabel(f.contentType), f.createdAt && fmtDate(f.createdAt), size].filter(Boolean).join(' · ')
    return (
      <li key={f.attachmentId} className="doc" draggable onDragStart={(e) => onRowDragStart(f, e)}>
        <button type="button" className="doc-open" onClick={() => act(f, 'view')} aria-busy={busy || undefined}>
          <span className="doc-ic" aria-hidden="true">{busy ? <Spinner size={20} /> : f.kind === 'photo' ? <ImageIcon size={20} /> : <FileText size={20} />}</span>
          <span className="doc-main">
            <span className="doc-name">{f.filename}</span>
            <span className="doc-meta">{f.passwordProtected && <Lock size={12} className="doc-meta-lock" aria-hidden="true" />}{meta}</span>
          </span>
          <span className="sr-only">{busy ? 'Opening…' : `Open ${f.filename}`}{f.passwordProtected ? ' (protected — PIN required)' : ''}</span>
        </button>
        {f.passwordProtected && <Badge className="doc-lock" icon={Lock} title={`Protected with ${pinLabel(f)}`}>Protected</Badge>}
        <span className="doc-actions">
          <IconButton label={`Download ${f.filename}`} icon={Download} size={16} tooltip={false} onClick={() => act(f, 'download')} className="doc-act-wide" />
          <IconButton label={`Edit ${f.filename}`} icon={Pencil} size={16} tooltip={false} onClick={() => openEdit(f)} className="doc-act-wide" />
          <IconButton label={`Delete ${f.filename}`} icon={Trash2} size={16} variant="danger" tooltip={false} onClick={() => openDelete(f)} className="doc-act-wide" />
          <span className="doc-act-menu">
            <Menu label={`Actions for ${f.filename}`} icon={MoreVertical} items={[
              { key: 'dl', label: 'Download', icon: Download, onSelect: () => act(f, 'download') },
              { key: 'ed', label: 'Rename or move', icon: Pencil, onSelect: () => openEdit(f) },
              { key: 'del', label: 'Delete', icon: Trash2, tone: 'danger', onSelect: () => openDelete(f) },
            ]} />
          </span>
        </span>
      </li>
    )
  }

  const section = (key, heading, items, { removable = false, dropCategory = '' } = {}) => (
    <section
      key={key}
      className={`doc-group ${dragOverKey === key ? 'is-dragover' : ''}`}
      aria-labelledby={`dg-${key}`}
      onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; if (dragOverKey !== key) setDragOverKey(key) }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOverKey(null) }}
      onDrop={(e) => onSectionDrop(dropCategory, e)}
    >
      <div className="doc-group-head">
        <Folder size={16} aria-hidden="true" className="doc-group-ic" />
        <h2 id={`dg-${key}`} className="doc-group-title">{heading}</h2>
        <Badge>{items.length}</Badge>
        {removable && (
          <span className="doc-group-tools">
            <IconButton label={`Rename category ${heading}`} icon={Pencil} size={16} onClick={() => openCatEdit(heading)} tooltipAlign="end" />
            {items.length === 0 && <IconButton label={`Remove category ${heading}`} icon={X} size={16} onClick={() => removeCustomCat(heading)} tooltipAlign="end" />}
          </span>
        )}
      </div>
      {items.length
        ? <ul role="list" className={`doc-list ${view === 'grid' ? 'doc-list--grid' : ''}`}>{items.map(renderFile)}</ul>
        : <p className="doc-group-empty">No documents here yet. Drag a document here, or use its “Rename or move” action.</p>}
    </section>
  )

  const nothing = files.length === 0 && categories.length === 0

  return (
    <div className="pg pg--wide">
      <style>{DOCS_CSS}</style>
      <PageHeader
        description="Your medical documents, stored securely. Select a document to open it — protected documents ask for their PIN."
        actions={(
          <>
            <SegmentedControl
              label="View"
              value={view}
              onChange={changeView}
              options={[{ value: 'list', label: 'List view', icon: List, hideLabel: true }, { value: 'grid', label: 'Grid view', icon: LayoutGrid, hideLabel: true }]}
            />
            <IconButton label="Refresh" icon={RefreshCw} variant="secondary" onClick={load} disabled={loading} />
            <Button variant="secondary" icon={Plus} onClick={() => { setNewCatOpen(true); setNewCatName('') }}>New category</Button>
            <Button variant="primary" icon={Upload} onClick={() => navigate('/documents/upload')}>Upload</Button>
          </>
        )}
      />

      {loading ? (
        <div className={showSkeleton ? 'doc-group' : ''} aria-busy="true">
          <span className="sr-only" role="status">Loading your documents…</span>
          {showSkeleton && [0, 1, 2].map((i) => (
            <div key={i} className="doc doc--skel"><Skeleton width="2.5rem" height="2.5rem" /><span className="doc-main"><Skeleton variant="text" width={`${60 - i * 12}%`} /><Skeleton variant="text" width="35%" /></span></div>
          ))}
        </div>
      ) : loadError && files.length === 0 ? (
        <ErrorState title="Couldn't load your documents" description={`${loadError} Your files are safe — check your connection and try again.`} onRetry={load} />
      ) : nothing ? (
        <EmptyState
          icon={FolderOpen}
          title="No documents yet"
          description="Upload prescriptions, lab reports or discharge summaries so they're with you when you need them. You can protect each one with a PIN."
          action={<Button variant="primary" icon={Upload} onClick={() => navigate('/documents/upload')}>Upload a document</Button>}
        />
      ) : (
        <div className="doc-groups">
          {loadError && <Alert tone="danger" title="Couldn't refresh your documents." action={<Button size="sm" variant="secondary" onClick={load}>Try again</Button>}>{loadError}</Alert>}
          {categories.map((cat) => section(`cat:${cat}`, cat, files.filter((f) => f.category === cat), { removable: true, dropCategory: cat }))}
          {uncategorized.length > 0 && section('uncat', 'Uncategorized', uncategorized, { dropCategory: '' })}
        </div>
      )}

      {/* PIN to view / download a protected document */}
      <Modal
        open={Boolean(pinModal)}
        onClose={() => setPinModal(null)}
        busy={pinBusy}
        icon={Lock}
        title="Enter this document's PIN"
        description={pinModal ? `“${pinModal.file.filename}” is protected with ${pinLabel(pinModal.file)}. Enter its 6-digit PIN to ${pinModal.action === 'view' ? 'open' : 'download'} it.` : ''}
        onSubmit={submitPin}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setPinModal(null)} disabled={pinBusy}>Cancel</Button>
            <Button type="submit" variant="primary" loading={pinBusy} loadingText="Checking PIN…" disabled={pin.length !== 6} hint={pin.length !== 6 ? 'Enter all 6 digits.' : undefined}>
              {pinModal?.action === 'view' ? 'Open' : 'Download'}
            </Button>
          </>
        )}
      >
        <Field label="PIN" error={pinError}>
          <PinInput value={pin} autoFocus onChange={(v) => { setPin(v); setPinError('') }} />
        </Field>
      </Modal>

      {/* Edit: rename + category */}
      <Modal
        open={Boolean(editTarget)}
        onClose={() => setEditTarget(null)}
        busy={editBusy}
        icon={Pencil}
        title="Rename or move"
        onSubmit={submitEdit}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setEditTarget(null)} disabled={editBusy}>Cancel</Button>
            <Button type="submit" variant="primary" loading={editBusy} loadingText="Saving…" disabled={!editName.trim()} hint={!editName.trim() ? 'The document needs a name.' : undefined}>Save</Button>
          </>
        )}
      >
        <Field label="Document name" required error={editTarget && !editName.trim() ? 'Enter a name.' : undefined}>
          <Input value={editName} maxLength={120} autoFocus onChange={(e) => setEditName(e.target.value)} />
        </Field>
        <Field label="Category" optional hint="Leave empty to keep it under Uncategorized.">
          <Input value={editCat} maxLength={60} list="doc-cat-options" placeholder="e.g. Prescriptions" onChange={(e) => setEditCat(e.target.value)} />
        </Field>
        <datalist id="doc-cat-options">{categories.map((c) => <option key={c} value={c} />)}</datalist>
      </Modal>

      {/* New category */}
      <Modal
        open={newCatOpen}
        onClose={() => setNewCatOpen(false)}
        icon={Folder}
        title="New category"
        description="Group related documents, such as prescriptions or lab reports."
        onSubmit={submitNewCat}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setNewCatOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={!newCatName.trim()} hint={!newCatName.trim() ? 'Enter a name first.' : undefined}>Create category</Button>
          </>
        )}
      >
        <Field label="Category name">
          <Input value={newCatName} maxLength={60} autoFocus placeholder="e.g. Prescriptions" onChange={(e) => setNewCatName(e.target.value)} />
        </Field>
      </Modal>

      {/* Rename category */}
      <Modal
        open={catEditTarget !== null}
        onClose={() => setCatEditTarget(null)}
        busy={catEditBusy}
        icon={Pencil}
        title="Rename category"
        description={catEditTarget ? `Every document in “${catEditTarget}” moves to the new name.` : ''}
        onSubmit={submitCatRename}
        footer={(
          <>
            <Button variant="secondary" onClick={() => setCatEditTarget(null)} disabled={catEditBusy}>Cancel</Button>
            <Button type="submit" variant="primary" loading={catEditBusy} loadingText="Renaming…" disabled={!catEditName.trim() || catEditName.trim() === catEditTarget}>Save</Button>
          </>
        )}
      >
        <Field label="Category name">
          <Input value={catEditName} maxLength={60} autoFocus onChange={(e) => setCatEditName(e.target.value)} />
        </Field>
      </Modal>

      {/* Delete — PIN step for protected files, then type "confirm" */}
      <Modal
        open={Boolean(deleteTarget)}
        onClose={closeDelete}
        busy={deleteBusy}
        icon={deletePinDone ? Trash2 : Lock}
        iconTone="danger"
        title={deletePinDone ? 'Delete this document permanently?' : 'Enter the PIN for this document'}
        description={deleteTarget ? (deletePinDone
          ? `“${deleteTarget.filename}” will be deleted. Deleted documents can't be recovered.`
          : 'This document is protected. Its 6-digit PIN is required before it can be deleted.') : ''}
        onSubmit={submitDelete}
        footer={(
          <>
            <Button variant="secondary" onClick={closeDelete} disabled={deleteBusy}>Cancel</Button>
            {deletePinDone
              ? <Button type="submit" variant="destructive" icon={Trash2} loading={deleteBusy} loadingText="Deleting…" disabled={!deleteReady} hint={!deleteReady ? `Type “${DELETE_CONFIRM_TEXT}” to enable.` : undefined}>Delete document</Button>
              : <Button type="submit" variant="primary" disabled={!deleteReady} hint={!deleteReady ? 'Enter all 6 digits.' : undefined}>Continue</Button>}
          </>
        )}
      >
        {!deletePinDone ? (
          <Field key="pin" label="PIN" error={deleteErr}>
            <PinInput value={deletePin} autoFocus onChange={(v) => { setDeletePin(v); setDeleteErr('') }} />
          </Field>
        ) : (
          <Field key="confirm" label={<>To confirm, type <strong>{DELETE_CONFIRM_TEXT}</strong></>} error={deleteErr}>
            <Input value={deleteText} autoFocus autoComplete="off" placeholder={DELETE_CONFIRM_TEXT} onChange={(e) => setDeleteText(e.target.value)} />
          </Field>
        )}
      </Modal>
    </div>
  )
}
