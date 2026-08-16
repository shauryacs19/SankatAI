// Profile tab — presentational. State/handlers are owned by the Dashboard shell
// and passed in as props. JSX extracted verbatim (no behavior change).

import {
  User, BadgeCheck, Droplet, Phone, HeartPulse, Accessibility,
  Languages, Pencil, AlertTriangle, Stethoscope,
} from 'lucide-react'
import InfoRow from '../../../components/ui/InfoRow.jsx'
import SecurityPins from './SecurityPins.jsx'

export default function ProfileTab({ profile, fullName, age, profileCompletion, contacts, onEditProfile }) {
  return (
    <div className="db-view scroll-view">
      <div className="db-cards">
        <section className="dx-card">
          <div className="dx-profile-head">
            <div className="dx-avatar">{(profile?.firstName?.[0] || 'U').toUpperCase()}</div>
            <div className="dx-profile-id"><h3 className="dx-profile-name">{fullName}</h3><span className="dx-verified"><BadgeCheck size={13} /> Verified</span></div>
            {profile?.bloodGroup && <span className="dx-blood"><Droplet size={12} /> {profile.bloodGroup}</span>}
          </div>
          <div className="dx-completion"><div className="dx-completion-top"><span>Profile completion</span><span>{profileCompletion}%</span></div><div className="dx-progress"><div className="dx-progress-fill" style={{ width: `${profileCompletion}%` }} /></div></div>
          <div className="dx-facts"><InfoRow label="Age" value={age != null ? `${age} yrs` : null} /><InfoRow label="Gender" value={profile?.gender} /><InfoRow label="Phone" value={profile?.phone} /><InfoRow label="Email" value={profile?.email} /><InfoRow label="Language" value={profile?.preferredLanguage} /></div>
          <button className="dx-setting-btn" onClick={onEditProfile}><Pencil size={15} /> Edit profile</button>
        </section>

        <section className="dx-card">
          <div className="dx-card-title"><Stethoscope size={15} /> Medical Information</div>
          <div className="dx-med-item"><Droplet size={14} /><div><span className="dx-med-label">Blood group</span><span className="dx-med-val">{profile?.bloodGroup || '—'}</span></div></div>
          <div className="dx-med-item"><AlertTriangle size={14} /><div><span className="dx-med-label">Allergies</span><span className="dx-med-val">{profile?.allergies || 'None'}</span></div></div>
          <div className="dx-med-item"><HeartPulse size={14} /><div><span className="dx-med-label">Conditions</span><span className="dx-med-val">{profile?.conditions || 'None'}</span></div></div>
          <div className="dx-med-item"><Accessibility size={14} /><div><span className="dx-med-label">Disability</span><span className="dx-med-val">{profile?.disability || 'None'}</span></div></div>
          <div className="dx-med-item"><Languages size={14} /><div><span className="dx-med-label">Language</span><span className="dx-med-val">{profile?.preferredLanguage || 'English'}</span></div></div>
        </section>

        <section className="dx-card">
          <div className="dx-card-title"><Phone size={15} /> Emergency Contacts</div>
          {contacts.length === 0 && <p className="dx-empty">No contacts added yet.</p>}
          {contacts.map((c, i) => (
            <div key={i} className="dx-emerg-row">
              <span className="dx-emerg-icon dx-muted-icon"><User size={16} /></span>
              <span className="dx-emerg-main"><span className="dx-emerg-label">{c.name || 'Contact'}</span><span className="dx-emerg-num">{[c.relationship, c.phone].filter(Boolean).join(' · ')}</span></span>
              {c.phone && <a href={`tel:${c.phone}`} className="dx-call ghost"><Phone size={13} /></a>}
            </div>
          ))}
        </section>

        <SecurityPins />
      </div>
    </div>
  )
}
