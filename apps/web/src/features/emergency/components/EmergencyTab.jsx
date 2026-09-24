// Emergency tab — presentational; handlers are owned by the dashboard shell.
// Nothing here animates in or waits on data: every call link works on first
// paint. Call 108 is the first and most prominent action.

import { Phone, Ambulance, MapPin, Hospital, Pencil } from 'lucide-react'
import { EMERGENCY_NUMBERS } from '../../chat/utils/format.jsx'
import { Button, Card, EmptyState, IconButton } from '../../../components/ui'

const CSS = `
.emg-hero { display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-5); border: 1px solid var(--sev-emergency-border); border-radius: var(--radius-card); background: var(--sev-emergency-soft); }
.emg-hero-title { font-size: var(--fs-lg); line-height: var(--lh-lg); font-weight: var(--fw-semibold); color: var(--sev-emergency-ink); }
.emg-hero-text { font-size: var(--fs-md); line-height: var(--lh-md); color: var(--text-primary); margin-top: calc(-1 * var(--space-2)); }
.emg-hero .ui-btn--emergency { min-height: 3.5rem; font-size: var(--fs-md); line-height: var(--lh-md); }
.emg-row { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; }
.emg-row-ic { display: grid; place-items: center; width: 2.5rem; height: 2.5rem; border-radius: var(--radius-control); background: var(--surface-sunken); color: var(--text-secondary); flex-shrink: 0; }
.emg-row-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.emg-row-name { font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-medium); }
.emg-row-num { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); font-variant-numeric: tabular-nums; }
.emg-actions { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: var(--space-3); }
.emg-actions .ui-tipwrap, .emg-actions .ui-btn { width: 100%; }
@media (max-width: 479px) { .emg-actions { grid-template-columns: minmax(0, 1fr); } }
`

export default function EmergencyTab({ contacts = [], primaryContact, onSendLocationAlert, onFindHospitals, onEditProfile }) {
  const hasContact = Boolean(primaryContact?.phone)
  const reachable = contacts.filter((c) => c.phone)
  return (
    <div className="pg">
      <style>{CSS}</style>

      <section className="emg-hero" aria-labelledby="emg-title">
        <h2 id="emg-title" className="emg-hero-title">In a medical emergency, call an ambulance now.</h2>
        <p className="emg-hero-text">108 is free across India and connects you to the nearest ambulance.</p>
        <Button variant="emergency" icon={Ambulance} href="tel:108" block>Call 108 — Ambulance</Button>
        <div className="emg-actions">
          <Button variant="secondary" icon={MapPin} onClick={onSendLocationAlert} disabled={!hasContact} hint={hasContact ? undefined : 'Add an emergency contact to share your location with them.'}>
            {hasContact ? `Send my location to ${primaryContact.name || 'my contact'}` : 'Share my location'}
          </Button>
          <Button variant="secondary" icon={Hospital} onClick={onFindHospitals}>Nearby hospitals</Button>
        </div>
      </section>

      <Card title="Your emergency contacts" icon={Phone}>
        {reachable.length === 0 ? (
          <EmptyState
            compact
            headingLevel={3}
            title="No emergency contacts"
            description="Add someone to call and share your location with in an emergency."
            action={<Button variant="secondary" icon={Pencil} onClick={onEditProfile}>Add a contact</Button>}
          />
        ) : (
          <ul role="list" className="ui-rows">
            {reachable.map((c, i) => (
              <li key={i} className="emg-row">
                <span className="emg-row-text">
                  <span className="emg-row-name">{c.name || 'Emergency contact'}{c.relationship ? ` · ${c.relationship}` : ''}</span>
                  <span className="emg-row-num">{c.phone}</span>
                </span>
                <Button variant="emergency" size="sm" icon={Phone} href={`tel:${c.phone}`} aria-label={`Call ${c.name || 'emergency contact'}`}>Call</Button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      <Card title="Emergency numbers" icon={Phone}>
        <ul role="list" className="ui-rows">
          {EMERGENCY_NUMBERS.map((n) => (
            <li key={n.number} className="emg-row">
              <span className="emg-row-ic"><n.Icon size={18} aria-hidden="true" /></span>
              <span className="emg-row-text"><span className="emg-row-name">{n.label}</span><span className="emg-row-num">{n.number}</span></span>
              <IconButton label={`Call ${n.label}, ${n.number}`} icon={Phone} variant="secondary" href={`tel:${n.number}`} tooltipAlign="end" />
            </li>
          ))}
        </ul>
      </Card>
    </div>
  )
}
