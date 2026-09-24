import { useOutletContext } from 'react-router-dom'
import EmergencyTab from '../../emergency/components/EmergencyTab.jsx'

export default function EmergencyPage() {
  const { contacts, primaryContact, handleSendLocationAlert, handleFindHospitals, goEditProfile } = useOutletContext()
  return (
    <EmergencyTab
      contacts={contacts}
      primaryContact={primaryContact}
      onSendLocationAlert={handleSendLocationAlert}
      onFindHospitals={handleFindHospitals}
      onEditProfile={goEditProfile}
    />
  )
}
