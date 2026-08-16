import { useOutletContext } from 'react-router-dom'
import SettingsTab from '../../profile/components/SettingsTab.jsx'

export default function SettingsPage() {
  const { isOffline, profile, goEditProfile, goChat, handleSignOut } = useOutletContext()
  return (
    <SettingsTab
      isOffline={isOffline}
      profile={profile}
      onEditProfile={goEditProfile}
      onGoChat={goChat}
      onSignOut={handleSignOut}
    />
  )
}
