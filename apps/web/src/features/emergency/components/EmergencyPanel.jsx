// Emergency panel — shown under the app bar when SOS is pressed or the AI
// assesses an EMERGENCY. Renders instantly (no entrance animation, no loading
// gate) and the first action is a direct tel: link that fires immediately.

import { Ambulance, Phone, MapPin, Hospital, Siren, X } from 'lucide-react'
import { EMERGENCY_CALLOUT } from '@sankatai/shared'
import { Button, IconButton, SeverityBadge } from '../../../components/ui'

const CSS = `
.em { background: var(--sev-emergency-soft); border-bottom: 1px solid var(--sev-emergency-border); }
.em-inner { max-width: var(--content-wide); margin: 0 auto; padding: var(--space-4) var(--space-6); display: flex; flex-direction: column; gap: var(--space-3); }
.em-head { display: flex; align-items: center; gap: var(--space-2); flex-wrap: wrap; }
.em-title { display: inline-flex; align-items: center; gap: var(--space-2); font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-semibold); color: var(--sev-emergency-ink); }
.em-close { margin-left: auto; }
.em-text { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-primary); }
.em-actions { display: flex; flex-wrap: wrap; gap: var(--space-2); }
@media (max-width: 767px) {
  .em-inner { padding: var(--space-3) var(--space-4); }
  .em-actions { display: grid; grid-template-columns: 1fr 1fr; }
  .em-actions > :first-child { grid-column: 1 / -1; }
  .em-actions .ui-btn, .em-actions .ui-tipwrap { width: 100%; }
}
`

export default function EmergencyPanel({ fromAssessment, riskScore, primaryContact, contactsLoading, onShareLocation, onFindHospitals, onDismiss }) {
  const hasContact = Boolean(primaryContact?.phone)
  const noContactHint = contactsLoading ? 'Still loading your emergency contacts…' : 'Add an emergency contact in your health profile to use this.'
  return (
    <section className="em" aria-labelledby="em-title">
      <style>{CSS}</style>
      <div className="em-inner">
        <div className="em-head">
          <h2 id="em-title" className="em-title"><Siren size={18} aria-hidden="true" /> Emergency help</h2>
          {fromAssessment && <SeverityBadge severity="EMERGENCY" score={riskScore} />}
          <IconButton label="Close emergency panel" icon={X} className="em-close" onClick={onDismiss} tooltipAlign="end" />
        </div>
        <p className="em-text">{EMERGENCY_CALLOUT}</p>
        <div className="em-actions">
          <Button variant="emergency" icon={Ambulance} href="tel:108">Call 108 — Ambulance</Button>
          <Button
            variant="secondary"
            icon={Phone}
            href={hasContact ? `tel:${primaryContact.phone}` : undefined}
            disabled={!hasContact}
            hint={hasContact ? undefined : noContactHint}
          >
            {hasContact ? `Call ${primaryContact.name || 'emergency contact'}` : 'Call emergency contact'}
          </Button>
          <Button variant="secondary" icon={MapPin} onClick={onShareLocation} disabled={!hasContact} hint={hasContact ? undefined : noContactHint}>Share my location</Button>
          <Button variant="secondary" icon={Hospital} onClick={onFindHospitals}>Nearby hospitals</Button>
        </div>
      </div>
    </section>
  )
}
