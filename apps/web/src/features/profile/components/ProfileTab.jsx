// Health profile — presentational; state comes from the dashboard shell.
// Empty medical fields read "Not provided" (never "None", which would be a
// clinical statement the user didn't make).

import {
  Droplet, Phone, HeartPulse, Accessibility, Languages, Pencil, AlertTriangle, Stethoscope,
  Calendar, User, Mail, Users,
} from 'lucide-react'
import { Avatar, Badge, Button, Card, EmptyState, IconButton, InfoRow, PageHeader } from '../../../components/ui'
import SecurityPins from './SecurityPins.jsx'

const CSS = `
.pf-id { display: flex; align-items: center; gap: var(--space-4); }
.pf-id-text { display: flex; flex-direction: column; gap: var(--space-1); min-width: 0; flex: 1; }
.pf-name { font-size: var(--fs-xl); line-height: var(--lh-xl); font-weight: var(--fw-semibold); overflow-wrap: anywhere; }
.pf-completion { display: flex; flex-direction: column; gap: var(--space-2); margin-top: var(--space-5); }
.pf-completion-row { display: flex; justify-content: space-between; font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-secondary); }
.pf-bar { height: 0.375rem; border-radius: var(--radius-pill); background: var(--surface-sunken); overflow: hidden; }
.pf-bar span { display: block; height: 100%; background: var(--text-secondary); transform-origin: left center; }
.pf-contact { display: flex; align-items: center; gap: var(--space-3); padding: var(--space-3) 0; }
.pf-contact-text { display: flex; flex-direction: column; min-width: 0; flex: 1; }
.pf-contact-name { font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-medium); }
.pf-contact-meta { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
`

export default function ProfileTab({ profile, fullName, age, profileCompletion, contacts, onEditProfile }) {
  return (
    <div className="pg">
      <style>{CSS}</style>
      <PageHeader
        description="The details SankatAI uses to make its guidance safer. Keep them up to date."
        actions={<Button variant="secondary" icon={Pencil} onClick={onEditProfile}>Edit profile</Button>}
      />

      <Card title="Personal details" icon={User}>
        <div className="pf-id">
          <Avatar name={profile?.firstName} size="lg" />
          <div className="pf-id-text">
            <p className="pf-name">{fullName}</p>
            {profile?.bloodGroup && <span><Badge icon={Droplet}>Blood group {profile.bloodGroup}</Badge></span>}
          </div>
        </div>
        {profileCompletion < 100 && (
          <div className="pf-completion">
            <div className="pf-completion-row"><span id="pf-completion-label">Required details completed</span><span>{profileCompletion}%</span></div>
            <div className="pf-bar" role="progressbar" aria-labelledby="pf-completion-label" aria-valuemin={0} aria-valuemax={100} aria-valuenow={profileCompletion}>
              <span style={{ transform: `scaleX(${profileCompletion / 100})` }} />
            </div>
          </div>
        )}
        <div className="ui-rows">
          <InfoRow icon={Calendar} label="Age" value={age != null ? `${age} years` : null} />
          <InfoRow icon={User} label="Gender" value={profile?.gender} />
          <InfoRow icon={Phone} label="Phone" value={profile?.phone} />
          <InfoRow icon={Mail} label="Email" value={profile?.email} />
          <InfoRow icon={Languages} label="Preferred language" value={profile?.preferredLanguage} />
        </div>
      </Card>

      <Card title="Medical information" icon={Stethoscope}>
        <div className="ui-rows">
          <InfoRow icon={Droplet} label="Blood group" value={profile?.bloodGroup} />
          <InfoRow icon={AlertTriangle} label="Allergies" value={profile?.allergies} />
          <InfoRow icon={HeartPulse} label="Medical conditions" value={profile?.conditions} />
          <InfoRow icon={Accessibility} label="Disability" value={profile?.disability} />
        </div>
      </Card>

      <Card title="Emergency contacts" icon={Users}>
        {contacts.length === 0 ? (
          <EmptyState
            compact
            headingLevel={3}
            title="No emergency contacts"
            description="Add someone SankatAI can help you call or send your location to in an emergency."
            action={<Button variant="secondary" icon={Pencil} onClick={onEditProfile}>Add a contact</Button>}
          />
        ) : (
          <ul role="list" className="ui-rows">
            {contacts.map((c, i) => (
              <li key={i} className="pf-contact">
                <Avatar name={c.name} />
                <span className="pf-contact-text">
                  <span className="pf-contact-name">{c.name || 'Contact'}</span>
                  <span className="pf-contact-meta">{[c.relationship, c.phone].filter(Boolean).join(' · ') || 'No phone number'}</span>
                </span>
                {c.phone && <IconButton label={`Call ${c.name || 'contact'}`} icon={Phone} variant="secondary" href={`tel:${c.phone}`} tooltipAlign="end" />}
              </li>
            ))}
          </ul>
        )}
      </Card>

      <SecurityPins />
    </div>
  )
}
