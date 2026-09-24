// Upload a medical document (route /documents/upload). Owns the page chrome and
// the success state; the form is DocumentUploadForm. This is a standalone page
// (outside the dashboard shell), so it carries its own emergency call link.

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ArrowLeft, CheckCircle2, Lock, Phone } from 'lucide-react'
import DocumentUploadForm from '../components/DocumentUploadForm.jsx'
import { Brand, Button, SkipLink } from '../../../components/ui'
import { STANDALONE_CSS } from '../../../components/layout/standalone.styles'

export default function DocumentUploadPage() {
  const navigate = useNavigate()
  const [done, setDone] = useState(null) // the uploaded record on success
  const goBack = () => navigate('/dashboard/files')

  return (
    <div className="sa">
      <style>{STANDALONE_CSS}</style>
      <SkipLink />
      <header className="sa-bar">
        <Button variant="ghost" icon={ArrowLeft} onClick={goBack}>Documents</Button>
        <Brand size="sm" className="sa-brand" />
        <Button variant="emergency" icon={Phone} href="tel:108" aria-label="Emergency — call 108">108</Button>
      </header>

      <main id="main" tabIndex={-1} className="sa-main">
        <div className="sa-card">
          {done ? (
            <div className="sa-success" role="status">
              <CheckCircle2 size={32} className="sa-success-ic" aria-hidden="true" />
              <h1 className="sa-title">Document uploaded</h1>
              <p className="sa-lead">
                <strong>{done.fileName}</strong> is now in your documents.
                {done.passwordProtected && <> It's protected <Lock size={14} aria-hidden="true" className="sa-inline-ic" /> and will ask for its PIN when opened.</>}
              </p>
              <div className="ui-form-actions">
                <Button variant="secondary" onClick={() => setDone(null)}>Upload another</Button>
                <Button variant="primary" onClick={goBack}>Back to documents</Button>
              </div>
            </div>
          ) : (
            <>
              <h1 className="sa-title">Upload a document</h1>
              <p className="sa-lead">Add a prescription, lab report or discharge summary. You can protect it with one of your security PINs.</p>
              <DocumentUploadForm onSuccess={setDone} onCancel={goBack} />
            </>
          )}
        </div>
      </main>
    </div>
  )
}
