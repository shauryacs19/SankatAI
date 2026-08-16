// Emergency tab — presentational. Handlers owned by the Dashboard shell.
// JSX extracted verbatim (no behavior change).

import { Phone, Siren, Ambulance, MapPin } from 'lucide-react'
import { EMERGENCY_NUMBERS } from '../../chat/utils/format.jsx'

export default function EmergencyTab({ primaryContact, onSendLocationAlert, onFindHospitals }) {
  return (
    <div className="db-view scroll-view">
      <div className="db-cards">
        <section className="dx-card">
          <div className="dx-card-title"><Phone size={15} /> Emergency Numbers</div>
          {EMERGENCY_NUMBERS.map(({ label, number, Icon }) => (
            <div key={number} className="dx-emerg-row">
              <span className="dx-emerg-icon"><Icon size={16} /></span>
              <span className="dx-emerg-main"><span className="dx-emerg-label">{label}</span><span className="dx-emerg-num">{number}</span></span>
              <a href={`tel:${number}`} className="dx-call"><Phone size={13} /> Call</a>
            </div>
          ))}
        </section>
        <section className="dx-card">
          <div className="dx-card-title"><Siren size={15} /> Quick Actions</div>
          <div className="dx-action-grid">
            <a href="tel:108" className="dx-action danger"><Ambulance size={15} /> Call ambulance</a>
            <button className="dx-action" onClick={() => primaryContact?.phone && (window.location.href = `tel:${primaryContact.phone}`)} disabled={!primaryContact?.phone}><Phone size={15} /> Call emergency contact</button>
            <button className="dx-action" onClick={onSendLocationAlert} disabled={!primaryContact?.phone}><MapPin size={15} /> Share my location</button>
            <button className="dx-action" onClick={onFindHospitals}><MapPin size={15} /> Find nearby hospital</button>
          </div>
        </section>
      </div>
    </div>
  )
}
