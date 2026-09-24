import { Activity, Ambulance, MapPin, Hospital } from 'lucide-react'
import { AI_DISCLAIMER } from '@sankatai/shared'
import { Button, EmptyState, Modal, SeverityBadge, severityUi } from '../../../components/ui'
import { formatBold } from '../utils/format.jsx'

// Latest structured assessment, in a side drawer (focus-trapped, Escape closes).
export default function AnalysisDrawer({ open, onClose, analysis, primaryContact, onShareLocation, onFindHospitals }) {
  const sev = analysis?.severity ? severityUi(analysis.severity) : null
  const score = Math.min(100, Math.max(0, Number(analysis?.riskScore) || 0))
  const hasContact = Boolean(primaryContact?.phone)
  return (
    <Modal open={open} onClose={onClose} variant="side" title="AI analysis" description="Your most recent assessment in this chat.">
      {sev ? (
        <div className="an">
          <section className="an-section" aria-label="Risk">
            <div className="an-risk">
              <SeverityBadge severity={analysis.severity} size="lg" />
              <span className="an-score">{analysis.riskScore ?? '—'}<small>/100</small></span>
            </div>
            <div className="an-meter" role="meter" aria-label="Risk score" aria-valuemin={0} aria-valuemax={100} aria-valuenow={score}>
              <span className={`sev-${sev.cls}`} style={{ transform: `scaleX(${score / 100})` }} />
            </div>
          </section>
          {analysis.advice && <section className="an-section"><h3>Recommendation</h3><p>{formatBold(analysis.advice)}</p></section>}
          {analysis.reasoning && <section className="an-section"><h3>Clinical reasoning</h3><p>{analysis.reasoning}</p></section>}
          <section className="an-section">
            <h3>If you need help now</h3>
            <div className="an-actions">
              <Button variant="emergency" icon={Ambulance} href="tel:108" block>Call 108 — Ambulance</Button>
              <Button variant="secondary" icon={MapPin} block onClick={onShareLocation} disabled={!hasContact} hint={hasContact ? undefined : 'Add an emergency contact in your health profile to use this.'}>Share my location</Button>
              <Button variant="secondary" icon={Hospital} block onClick={onFindHospitals}>Nearby hospitals</Button>
            </div>
          </section>
          <p className="msg-ai-disclaimer">{analysis.disclaimer || AI_DISCLAIMER}</p>
        </div>
      ) : (
        <EmptyState compact icon={Activity} title="No assessment yet" description="Describe your symptoms in the chat. Your latest risk assessment will appear here." />
      )}
    </Modal>
  )
}
