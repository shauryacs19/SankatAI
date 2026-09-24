// Medical document upload form.
//
// Collects a name, one file (any type — drag-and-drop or click) and optional
// protection with one of the user's ACCOUNT security PINs. On submit it uploads
// to the vault via the backend: pre-sign -> PUT to S3 -> confirm.
// (The old "allow AI analysis" toggle was removed: it was never sent anywhere,
// so it collected a consent that did nothing — see DESIGN_AUDIT.md D5.)

import { useEffect, useRef, useState } from 'react'
import { Upload, ShieldCheck, X, FileText, Image as ImageIcon } from 'lucide-react'
import CreatePinModal from '../../profile/components/CreatePinModal.jsx'
import { uploadFile } from '../../../services/uploads'
import { listPins } from '../../../services/securityApi'
import { kindForFile, isImageFile, fmtFileSize } from '@sankatai/shared'
import { Alert, Button, Field, IconButton, Input, Select, Switch } from '../../../components/ui'

const CSS = `
.up-drop {
  display: flex; flex-direction: column; align-items: center; gap: var(--space-2); width: 100%; padding: var(--space-8) var(--space-4);
  border: 1px dashed var(--border-strong); border-radius: var(--radius-card); background: var(--surface-sunken);
  color: var(--text-secondary); text-align: center;
  transition: border-color var(--dur-fast) var(--ease-standard), background-color var(--dur-fast) var(--ease-standard);
}
.up-drop:hover, .up-drop.is-over { border-color: var(--focus-ring); background: var(--surface-hover); }
.up-drop-main { font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-medium); color: var(--text-primary); }
.up-drop-sub { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.up-file { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); }
.up-thumb { display: grid; place-items: center; width: 3rem; height: 3rem; border-radius: var(--radius-control); background: var(--surface-sunken); color: var(--text-secondary); overflow: hidden; flex-shrink: 0; }
.up-thumb img { width: 100%; height: 100%; object-fit: cover; }
.up-file-main { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.up-file-name { font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.up-file-meta { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.up-protect { display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); }
.up-hint { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); text-align: right; }
@media (max-width: 479px) { .up-hint { text-align: left; } }
`

export default function DocumentUploadForm({ onSuccess, onCancel }) {
  const [fileName, setFileName] = useState('')
  const [nameTouched, setNameTouched] = useState(false)
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [passwordProtect, setPasswordProtect] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // account security PINs
  const [pins, setPins] = useState([])
  const [pinsLoading, setPinsLoading] = useState(true)
  const [pinsError, setPinsError] = useState(false)
  const [pinId, setPinId] = useState('')
  const [pinModalOpen, setPinModalOpen] = useState(false)

  const inputRef = useRef(null)

  const fetchPins = () => listPins()
    .then((list) => { setPins(Array.isArray(list) ? list : []); setPinId((cur) => cur || (list && list[0]?.id) || '') })
    .catch(() => { setPins([]); setPinsError(true) })
    .finally(() => setPinsLoading(false))
  const loadPins = () => { setPinsLoading(true); setPinsError(false); fetchPins() }
  useEffect(() => { fetchPins() }, [])
  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null); setFile(null)
    if (inputRef.current) inputRef.current.value = ''
  }

  // Any file type is accepted; kind (photo/document) is derived from the file itself.
  const acceptFile = (picked) => {
    if (!picked) return
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(picked)
    setPreviewUrl(isImageFile(picked.name, picked.type) ? URL.createObjectURL(picked) : null)
    if (!fileName.trim()) setFileName(picked.name)
    setSubmitError('')
  }
  const onFilePicked = (e) => {
    const picked = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    acceptFile(picked)
  }
  const onDrop = (e) => { e.preventDefault(); setDragOver(false); acceptFile(e.dataTransfer.files?.[0]) }

  const togglePassword = (on) => {
    setPasswordProtect(on)
    if (on && !pinId && pins[0]) setPinId(pins[0].id)
  }

  const pinValid = !passwordProtect || (pins.length > 0 && Boolean(pinId))
  const isValid = Boolean(fileName.trim()) && Boolean(file) && pinValid
  const whyDisabled = !file ? 'Choose a file to upload.' : !fileName.trim() ? 'Give the document a name.' : !pinValid ? 'Choose a PIN, or turn protection off.' : ''

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!isValid || submitting) return
    setSubmitting(true); setSubmitError('')
    const kind = kindForFile(file.name, file.type)
    try {
      const rec = await uploadFile(file, {
        scope: 'vault', kind, filename: fileName.trim(),
        passwordProtected: passwordProtect, pinId: passwordProtect ? pinId : null,
      })
      onSuccess?.({ ...rec, fileName: fileName.trim(), passwordProtected: passwordProtect })
    } catch (err) {
      setSubmitError(err.message || 'The upload failed. Check your connection and try again.')
      setSubmitting(false)
    }
  }

  const isImg = file && isImageFile(file.name, file.type)
  const n = fileName.trim() || 'document'
  const shortName = n.length > 24 ? `${n.slice(0, 22)}…` : n

  return (
    <>
      <style>{CSS}</style>
      <form className="ui-form" onSubmit={handleSubmit} noValidate>
        <div className="ui-field">
          <span className="ui-label" id="up-file-label">File<span className="ui-req" aria-hidden="true">*</span></span>
          {file ? (
            <div className="up-file" aria-labelledby="up-file-label">
              <span className="up-thumb">{isImg && previewUrl ? <img src={previewUrl} alt="" /> : isImg ? <ImageIcon size={20} aria-hidden="true" /> : <FileText size={20} aria-hidden="true" />}</span>
              <span className="up-file-main">
                <span className="up-file-name" title={file.name}>{file.name}</span>
                <span className="up-file-meta">{[file.type || 'File', fmtFileSize(file.size)].filter(Boolean).join(' · ')}</span>
              </span>
              <IconButton label="Remove file" icon={X} onClick={clearFile} tooltipAlign="end" />
            </div>
          ) : (
            <button
              type="button"
              className={`up-drop ${dragOver ? 'is-over' : ''}`}
              aria-describedby="up-file-label"
              onClick={() => inputRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!dragOver) setDragOver(true) }}
              onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
              onDrop={onDrop}
            >
              <Upload size={20} aria-hidden="true" />
              <span className="up-drop-main">Choose a file, or drag it here</span>
              <span className="up-drop-sub">PDF, photos or any other document</span>
            </button>
          )}
          <input ref={inputRef} type="file" hidden onChange={onFilePicked} />
        </div>

        <Field label="Document name" required hint="This is how it will appear in your documents." error={nameTouched && !fileName.trim() ? 'Give the document a name.' : undefined}>
          <Input value={fileName} onChange={(e) => setFileName(e.target.value)} onBlur={() => setNameTouched(true)} placeholder="e.g. Blood test — March 2026" />
        </Field>

        <div className="up-protect">
          <Switch
            checked={passwordProtect}
            onChange={togglePassword}
            label="Protect with a PIN"
            description="Anyone opening, downloading or deleting it will need the PIN."
          />
          {passwordProtect && (
            pinsLoading ? <p className="ui-hint" role="status">Loading your security PINs…</p>
              : pinsError ? (
                <Alert tone="danger" title="Couldn't load your PINs." action={<Button size="sm" variant="secondary" onClick={loadPins}>Try again</Button>}>Turn protection off to upload without a PIN.</Alert>
              ) : pins.length === 0 ? (
                <Alert tone="info" title="You don't have a PIN yet." action={<Button size="sm" variant="secondary" icon={ShieldCheck} onClick={() => setPinModalOpen(true)}>Create a PIN</Button>}>
                  Create one now — you'll stay on this page.
                </Alert>
              ) : (
                <Field label="Which PIN protects it?">
                  <Select value={pinId} onChange={(e) => setPinId(e.target.value)}>
                    {pins.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </Select>
                </Field>
              )
          )}
        </div>

        {submitError && <Alert tone="danger" title="Upload failed.">{submitError}</Alert>}

        <div className="ui-form-actions">
          <Button variant="secondary" onClick={onCancel} disabled={submitting}>Cancel</Button>
          <Button type="submit" variant="primary" icon={Upload} loading={submitting} loadingText={`Uploading ${shortName}…`} disabled={!isValid} hint={whyDisabled || undefined}>
            Upload document
          </Button>
        </div>
        {!isValid && !submitting && <p className="up-hint">{whyDisabled}</p>}
      </form>

      {/* Outside the upload form — nested <form> elements are invalid HTML. */}
      <CreatePinModal
        open={pinModalOpen}
        onClose={() => setPinModalOpen(false)}
        onCreated={(created) => { setPins((prev) => [...prev, created]); setPinId(created.id); setPinModalOpen(false) }}
      />
    </>
  )
}
