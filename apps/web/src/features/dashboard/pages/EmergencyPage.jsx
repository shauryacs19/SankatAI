import { useOutletContext } from 'react-router-dom'
import EmergencyTab from '../../emergency/components/EmergencyTab.jsx'

export default function EmergencyPage() {
  const { primaryContact, handleSendLocationAlert, handleFindHospitals } = useOutletContext()
  return (
    <EmergencyTab
      primaryContact={primaryContact}
      onSendLocationAlert={handleSendLocationAlert}
      onFindHospitals={handleFindHospitals}
    />
  )
}
