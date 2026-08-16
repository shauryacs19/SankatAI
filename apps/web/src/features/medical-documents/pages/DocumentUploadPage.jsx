// Dedicated page for uploading a medical document (FRONTEND ONLY).
// Route target for /documents/upload. Owns the page chrome + success state and
// delegates the form to DocumentUploadForm.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, HeartPulse, CheckCircle2 } from 'lucide-react'
import DocumentUploadForm from '../components/DocumentUploadForm.jsx'

export default function DocumentUploadPage() {
  const navigate = useNavigate()
  const [done, setDone] = useState(null) // holds the submitted payload on success

  const goBack = () => navigate('/dashboard/files')

  return (
    <div className="du">
      <style>{DU_CSS}</style>

      <div className="du-card">
        <div className="du-top">
          <button className="du-back" onClick={goBack} type="button"><ArrowLeft size={16} /> Documents</button>
          <div className="du-brand"><HeartPulse size={18} /> Sankat<span>.AI</span></div>
        </div>

        {done ? (
          <div className="du-success" role="status">
            <div className="du-check"><CheckCircle2 size={40} /></div>
            <h2>Document ready</h2>
            <p>
              <strong>{done.fileName}</strong> was prepared successfully
              {done.passwordProtected ? ' and is PIN-protected' : ''}.
            </p>
            <p className="du-note">This is a front-end preview — nothing was uploaded yet.</p>
            <div className="du-success-actions">
              <button className="du-btn ghost" type="button" onClick={() => setDone(null)}>Upload another</button>
              <button className="du-btn primary" type="button" onClick={goBack}>Back to Documents</button>
            </div>
          </div>
        ) : (
          <>
            <h1 className="du-title">Upload a medical document</h1>
            <p className="du-sub">Give the file a name, choose its type, and optionally protect it with a 6-digit PIN.</p>
            <DocumentUploadForm onSuccess={setDone} onCancel={goBack} />
          </>
        )}
      </div>
    </div>
  )
}

const DU_CSS = `
.du { min-height: 100vh; background: var(--bg-body, #F8FAFC); display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; color: var(--text-primary, #0F172A); }
.du-card { width: 100%; max-width: 640px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 22px; box-shadow: 0 20px 50px -12px rgba(16,24,40,0.12); padding: 28px; }
.du-top { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
.du-back { display: inline-flex; align-items: center; gap: 6px; background: transparent; border: none; color: var(--text-muted, #64748B); font-weight: 600; font-size: 0.9rem; cursor: pointer; padding: 6px 8px; border-radius: 9px; }
.du-back:hover { background: var(--surface-2, #F1F5F9); color: var(--text-primary, #0F172A); }
.du-brand { display: inline-flex; align-items: center; gap: 7px; font-weight: 800; font-size: 1rem; }
.du-brand svg, .du-brand span { color: var(--primary, #C4504B); }
.du-title { font-size: 1.5rem; font-weight: 800; letter-spacing: -0.02em; margin: 14px 0 6px; }
.du-sub { color: var(--text-muted, #64748B); margin: 0 0 22px; font-size: 0.95rem; line-height: 1.55; }

.du-form { display: flex; flex-direction: column; gap: 22px; }
.du-section { display: flex; flex-direction: column; gap: 10px; }
.du-field { display: flex; flex-direction: column; gap: 7px; }
.du-label { display: inline-flex; align-items: center; gap: 6px; font-size: 0.82rem; font-weight: 700; color: var(--text-secondary, #334155); }
.du-accept { margin-left: auto; font-weight: 500; font-size: 0.74rem; color: var(--text-muted, #94A3B8); }
.du-input { width: 100%; padding: 12px 14px; border-radius: 12px; border: 1.5px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-primary, #0F172A); font-size: 0.95rem; transition: border-color 0.15s, box-shadow 0.15s; }
.du-input:focus { outline: none; border-color: var(--primary, #C4504B); box-shadow: 0 0 0 3px var(--primary-glow, rgba(196, 80, 75,0.1)); }

/* type selector */
.du-types { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.du-type { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; text-align: left; padding: 16px; border-radius: 14px; border: 1.5px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); cursor: pointer; transition: all 0.15s; }
.du-type:hover { border-color: var(--primary, #C4504B); }
.du-type:focus-visible { outline: none; box-shadow: 0 0 0 3px var(--primary-glow, rgba(196, 80, 75,0.12)); }
.du-type.active { border-color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }
.du-type-icon { width: 42px; height: 42px; border-radius: 11px; display: grid; place-items: center; background: var(--surface-2, #F1F5F9); color: var(--text-muted, #64748B); }
.du-type.active .du-type-icon { background: var(--primary, #C4504B); color: #fff; }
.du-type-name { font-weight: 700; font-size: 0.92rem; }
.du-type-hint { font-size: 0.76rem; color: var(--text-muted, #64748B); }

/* choose-file drop zone */
.du-drop { display: flex; flex-direction: column; align-items: center; gap: 6px; width: 100%; padding: 26px 16px; border-radius: 14px; border: 1.5px dashed var(--border-subtle, #CBD5E1); background: var(--surface-2, #F8FAFC); color: var(--text-muted, #64748B); cursor: pointer; transition: all 0.15s; }
.du-drop:hover { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }
.du-drop-main { font-weight: 700; font-size: 0.9rem; color: var(--text-secondary, #334155); }
.du-drop:hover .du-drop-main { color: var(--primary, #C4504B); }
.du-drop-sub { font-size: 0.76rem; }
.du-drop.invalid { border-color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); }
.du-drop.invalid .du-drop-main { color: var(--primary, #C4504B); }
.du-drop.dragover { border-color: var(--primary, #C4504B); border-style: solid; background: var(--sev-emergency-soft, #FBF1F0); color: var(--primary, #C4504B); }
.du-drop.dragover .du-drop-main { color: var(--primary, #C4504B); }

/* file preview */
.du-file { display: flex; align-items: center; gap: 12px; padding: 12px; border-radius: 14px; border: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); }
.du-file-thumb { width: 52px; height: 52px; border-radius: 11px; overflow: hidden; flex-shrink: 0; background: var(--sev-emergency-soft, #FBF1F0); display: grid; place-items: center; }
.du-file-img { width: 100%; height: 100%; object-fit: cover; }
.du-file-ic { color: var(--primary, #C4504B); }
.du-file-info { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.du-file-name { font-weight: 600; font-size: 0.9rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.du-file-meta { font-size: 0.76rem; color: var(--text-muted, #64748B); }
.du-file-remove { flex-shrink: 0; background: transparent; border: none; color: var(--text-muted, #94A3B8); cursor: pointer; padding: 7px; border-radius: 9px; display: grid; place-items: center; }
.du-file-remove:hover { color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }

/* password protection */
.du-pw { border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 14px; padding: 14px 16px; background: var(--surface-2, #F8FAFC); display: flex; flex-direction: column; gap: 14px; }
.du-pw-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.du-pw-label { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; font-size: 0.9rem; color: var(--text-secondary, #334155); }
.du-pw-label svg { color: var(--primary, #C4504B); }
.du-switch { display: inline-flex; align-items: center; gap: 8px; border: 1.5px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); border-radius: 99px; padding: 4px 10px 4px 5px; cursor: pointer; transition: all 0.15s; }
.du-switch-knob { width: 18px; height: 18px; border-radius: 50%; background: var(--text-muted, #94A3B8); transition: all 0.15s; }
.du-switch-text { font-size: 0.72rem; font-weight: 800; color: var(--text-muted, #64748B); letter-spacing: 0.04em; }
.du-switch.on { border-color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }
.du-switch.on .du-switch-knob { background: var(--primary, #C4504B); transform: translateX(2px); }
.du-switch.on .du-switch-text { color: var(--primary, #C4504B); }
.du-pins { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
.du-pins .du-field input { width: 100%; padding: 11px 13px; border-radius: 11px; border: 1.5px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-primary, #0F172A); font-size: 1.1rem; letter-spacing: 0.3em; transition: border-color 0.15s, box-shadow 0.15s; }
.du-pins .du-field input:focus { outline: none; border-color: var(--primary, #C4504B); box-shadow: 0 0 0 3px var(--primary-glow, rgba(196, 80, 75,0.1)); }
.du-pins .du-field input.invalid { border-color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }
.du-fielderr { font-size: 0.75rem; color: var(--primary, #C4504B); font-weight: 600; margin-top: 5px; }
.du-submit-error { display: flex; align-items: center; gap: 8px; font-size: 0.85rem; color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); border: 1px solid var(--sev-emergency-border, #F0CFCD); padding: 10px 12px; border-radius: 10px; }
.du-pw-note { margin: 0; font-size: 0.82rem; color: var(--text-muted, #64748B); line-height: 1.5; }
.du-pw-setup { align-self: flex-start; background: var(--bg-surface, #fff); }

/* AI analysis consent */
.du-consent { border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 14px; padding: 14px 16px; background: var(--surface-2, #F8FAFC); }
.du-consent-row { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.du-disclosure { display: inline-flex; align-items: center; gap: 8px; flex: 1; min-width: 0; background: transparent; border: none; cursor: pointer; text-align: left; padding: 2px; border-radius: 8px; }
.du-chev { color: var(--text-muted, #64748B); flex-shrink: 0; transition: transform 0.15s ease; }
.du-chev.open { transform: rotate(90deg); }
.du-consent-label { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; font-size: 0.9rem; color: var(--text-secondary, #334155); }
.du-consent-label svg { color: var(--primary, #C4504B); flex-shrink: 0; }
.du-consent-desc { margin: 12px 0 0; padding-top: 12px; border-top: 1px solid var(--border-subtle, #E5E7EB); color: var(--text-muted, #64748B); font-size: 0.85rem; line-height: 1.55; }

/* footer */
.du-footer { display: flex; align-items: center; justify-content: flex-end; gap: 10px; padding-top: 18px; border-top: 1px solid var(--border-subtle, #E5E7EB); }
.du-btn { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; font-size: 0.9rem; padding: 11px 20px; border-radius: 12px; border: 1px solid transparent; cursor: pointer; transition: all 0.15s; }
.du-btn:disabled { opacity: 0.55; cursor: not-allowed; }
.du-btn.primary { background: var(--primary, #C4504B); color: #fff; box-shadow: 0 2px 8px rgba(196, 80, 75,0.2); }
.du-btn.primary:hover:not(:disabled) { background: var(--primary-hover, #A93F3B); }
.du-btn.ghost { background: transparent; color: var(--text-secondary, #334155); border-color: var(--border-subtle, #E5E7EB); }
.du-btn.ghost:hover:not(:disabled) { background: var(--surface-2, #F1F5F9); }

/* success state */
.du-success { text-align: center; padding: 20px 8px 8px; }
.du-check { color: var(--success, #059669); display: grid; place-items: center; margin-bottom: 8px; }
.du-success h2 { margin: 6px 0; font-size: 1.35rem; font-weight: 800; }
.du-success p { color: var(--text-secondary, #334155); margin: 4px 0; font-size: 0.95rem; }
.du-success .du-note { color: var(--text-muted, #94A3B8); font-size: 0.82rem; }
.du-success-actions { display: flex; gap: 10px; justify-content: center; margin-top: 18px; }

@media (max-width: 560px) {
  .du-card { padding: 20px; }
  .du-types, .du-pins { grid-template-columns: 1fr; }
  .du-footer { flex-direction: column-reverse; }
  .du-footer .du-btn { width: 100%; justify-content: center; }
  .du-success-actions { flex-direction: column-reverse; }
  .du-success-actions .du-btn { width: 100%; justify-content: center; }
}
`
