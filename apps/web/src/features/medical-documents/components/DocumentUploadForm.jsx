// Medical document upload form.
//
// Collects: file name, the selected file (any type, drag-and-drop or click), and
// an optional password protection using one of the user's ACCOUNT security PINs
// (created in Profile → Security PINs). On submit it uploads to the vault bucket
// via the backend: pre-sign -> PUT to S3 -> confirm. The "allow AI analysis"
// toggle is collected for display only (not yet persisted server-side).

import { useEffect, useRef, useState } from 'react'
import { Upload, ShieldCheck, AlertTriangle, Lock } from 'lucide-react'
import FilePreview from './FilePreview.jsx'
import AiAnalysisConsent from './AiAnalysisConsent.jsx'
import CreatePinModal from '../../profile/components/CreatePinModal.jsx'
import { uploadFile } from '../../../services/uploads'
import { listPins } from '../../../services/securityApi'
import { kindForFile, isImageFile } from '@sankatai/shared'

export default function DocumentUploadForm({ onSuccess, onCancel }) {
  const [fileName, setFileName] = useState('')
  const [file, setFile] = useState(null)
  const [previewUrl, setPreviewUrl] = useState(null)
  const [fileError, setFileError] = useState('')
  const [passwordProtect, setPasswordProtect] = useState(false)
  const [allowAnalysis, setAllowAnalysis] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [dragOver, setDragOver] = useState(false)

  // account security PINs
  const [pins, setPins] = useState([])
  const [pinsLoading, setPinsLoading] = useState(true)
  const [pinId, setPinId] = useState('')
  const [pinModalOpen, setPinModalOpen] = useState(false)

  const inputRef = useRef(null)

  useEffect(() => {
    let alive = true
    listPins()
      .then((list) => { if (alive) { setPins(Array.isArray(list) ? list : []); setPinId((list && list[0]?.id) || '') } })
      .catch(() => { if (alive) setPins([]) })
      .finally(() => { if (alive) setPinsLoading(false) })
    return () => { alive = false }
  }, [])

  useEffect(() => () => { if (previewUrl) URL.revokeObjectURL(previewUrl) }, [previewUrl])

  const clearFile = () => {
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setPreviewUrl(null); setFile(null); setFileError('')
    if (inputRef.current) inputRef.current.value = ''
  }

  // Any file type is accepted; kind (photo/document) is derived from the file itself.
  const acceptFile = (picked) => {
    if (!picked) return
    setFileError('')
    if (previewUrl) URL.revokeObjectURL(previewUrl)
    setFile(picked)
    setPreviewUrl(isImageFile(picked.name, picked.type) ? URL.createObjectURL(picked) : null)
    if (!fileName.trim()) setFileName(picked.name)
  }
  const onFilePicked = (e) => {
    const picked = e.target.files?.[0]
    if (inputRef.current) inputRef.current.value = ''
    acceptFile(picked)
  }
  const onDrop = (e) => {
    e.preventDefault()
    setDragOver(false)
    acceptFile(e.dataTransfer.files?.[0])
  }

  const togglePassword = (on) => {
    setPasswordProtect(on)
    if (on && !pinId && pins[0]) setPinId(pins[0].id)
  }

  const pinValid = !passwordProtect || (pins.length > 0 && Boolean(pinId))
  const isValid = Boolean(fileName.trim()) && Boolean(file) && pinValid

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
      onSuccess?.({ ...rec, fileName: fileName.trim(), passwordProtected: passwordProtect, allowAiAnalysis: allowAnalysis })
    } catch (err) {
      setSubmitError(err.message || 'Upload failed. Please try again.')
      setSubmitting(false)
    }
  }

  return (
    <>
    <form className="du-form" onSubmit={handleSubmit} noValidate>
      {/* 1. File name */}
      <div className="du-field">
        <label className="du-label" htmlFor="du-filename">File Name</label>
        <input id="du-filename" className="du-input" type="text" placeholder="Enter file name" value={fileName} onChange={(e) => setFileName(e.target.value)} />
      </div>

      {/* 2. File selection + preview — any file type, click or drag & drop */}
      <div className="du-section">
        <span className="du-label">
          Select a file
          <span className="du-accept">Any file type</span>
        </span>
        {file ? (
          <FilePreview file={file} kind={isImageFile(file.name, file.type) ? 'image' : 'document'} previewUrl={previewUrl} onRemove={clearFile} />
        ) : (
          <button
            type="button"
            className={`du-drop ${fileError ? 'invalid' : ''} ${dragOver ? 'dragover' : ''}`}
            onClick={() => inputRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'copy'; if (!dragOver) setDragOver(true) }}
            onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) setDragOver(false) }}
            onDrop={onDrop}
          >
            <Upload size={20} />
            <span className="du-drop-main">Drag a file here, or click to choose one</span>
            <span className="du-drop-sub">Any file type</span>
          </button>
        )}
        {fileError && <span className="du-fielderr" role="alert">{fileError}</span>}
        <input ref={inputRef} type="file" hidden onChange={onFilePicked} />
      </div>

      {/* 3. Password protection (choose an account PIN) + AI analysis consent */}
      {file && (
        <>
          <div className="du-pw">
            <div className="du-pw-row">
              <span className="du-pw-label"><Lock size={15} /> Password Protect the file</span>
              <button type="button" role="switch" aria-checked={passwordProtect} className={`du-switch ${passwordProtect ? 'on' : ''}`} onClick={() => togglePassword(!passwordProtect)}>
                <span className="du-switch-knob" />
                <span className="du-switch-text">{passwordProtect ? 'ON' : 'OFF'}</span>
              </button>
            </div>
            {passwordProtect && (
              pinsLoading ? <p className="du-pw-note">Loading your security PINs…</p>
                : pins.length === 0 ? (
                  <>
                    <p className="du-pw-note">Your account doesn’t have a PIN created.</p>
                    <button type="button" className="du-btn ghost du-pw-setup" onClick={() => setPinModalOpen(true)}>
                      <ShieldCheck size={15} /> Set up a PIN
                    </button>
                  </>
                ) : (
                  <label className="du-field">
                    <span className="du-label">Which PIN protects this file?</span>
                    <select className="du-input" value={pinId} onChange={(e) => setPinId(e.target.value)}>
                      {pins.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                    </select>
                  </label>
                )
            )}
          </div>
          <AiAnalysisConsent enabled={allowAnalysis} onToggle={setAllowAnalysis} />
        </>
      )}

      {submitError && <div className="du-submit-error" role="alert"><AlertTriangle size={15} /> {submitError}</div>}

      {/* 4. Submit */}
      <div className="du-footer">
        <button type="button" className="du-btn ghost" onClick={onCancel} disabled={submitting}>Cancel</button>
        <button type="submit" className="du-btn primary" disabled={!isValid || submitting}>
          {submitting ? 'Uploading…' : <><ShieldCheck size={16} /> Submit</>}
        </button>
      </div>
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
