// Doctor report dialog. `source` is either one chat ({ kind: 'chat',
// consultationId, title } - chat header / History row) or records picked on the
// timeline ({ kind: 'selection', ids, title }). The backend builds the PDF from
// exactly those records plus profile basics, allergies and medicines.

import { useEffect, useState } from 'react'
import { Download, ExternalLink, RotateCw, Stethoscope } from 'lucide-react'
import { Alert, Button, Modal, Spinner } from '../../../components/ui'
import { errText } from '../../../utils/errText'
import { getDoctorReportPdf, getSelectionReportPdf } from '../services/healthApi'

const FILENAME = 'sankatai-doctor-report.pdf'

export default function DoctorReportModal({ source, onClose }) {
  const [url, setUrl] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0) // "Try again" re-runs the effect

  // Build it as soon as the dialog opens (one chat per open).
  useEffect(() => {
    let live = true
    const load = source.kind === 'selection' ? getSelectionReportPdf(source.ids) : getDoctorReportPdf(source.consultationId)
    load
      .then((blob) => { if (live) setUrl(URL.createObjectURL(new Blob([blob], { type: 'application/pdf' }))) })
      .catch((err) => { if (live) setError(errText(err, 'Could not generate the report.')) })
    return () => { live = false }
  }, [source, attempt])
  useEffect(() => () => { if (url) URL.revokeObjectURL(url) }, [url])
  const retry = () => { setError(''); setAttempt((n) => n + 1) }

  const loading = !url && !error
  return (
    <Modal open onClose={onClose} size="lg" icon={Stethoscope} title="Doctor report"
      description={`${source.kind === 'selection' ? `Only the records you selected: ${source.title}` : `For this chat only: “${source.title || 'New consultation'}”`}. AI-generated parts are an informational summary, not a confirmed diagnosis.`}
      footer={url && (
        <>
          <Button variant="ghost" icon={ExternalLink} href={url} target="_blank" rel="noopener">Open in new tab</Button>
          <Button variant="primary" icon={Download} href={url} download={FILENAME}>Download PDF</Button>
        </>
      )}>
      {loading ? (
        <div className="dr-loading" role="status"><Spinner /> Preparing the report…</div>
      ) : error ? (
        <Alert tone="danger" title="The report wasn't generated." action={<Button size="sm" variant="secondary" icon={RotateCw} onClick={retry}>Try again</Button>}>{error}</Alert>
      ) : (
        <iframe className="dr-pdf" src={url} title="Doctor report preview">
          <p>Your browser can't preview PDFs here. Use Download PDF.</p>
        </iframe>
      )}
      <p className="dr-note">The report contains medical information. Share it only with people you trust.</p>
    </Modal>
  )
}

export const DOCTOR_REPORT_CSS = `
.dr-pdf { width: 100%; height: min(65vh, 46rem); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); background: var(--surface-sunken); display: block; }
.dr-loading { display: flex; align-items: center; justify-content: center; gap: var(--space-2); height: 12rem; color: var(--text-muted); }
.dr-note { margin-top: var(--space-2); font-size: var(--fs-xs); line-height: var(--lh-xs); color: var(--text-muted); }
`
