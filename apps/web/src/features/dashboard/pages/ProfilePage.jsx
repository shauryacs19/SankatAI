import { useOutletContext } from 'react-router-dom'
import ProfileTab from '../../profile/components/ProfileTab.jsx'

export default function ProfilePage() {
  const { profile, fullName, age, profileCompletion, contacts, goEditProfile } = useOutletContext()
  return (
    <ProfileTab
      profile={profile}
      fullName={fullName}
      age={age}
      profileCompletion={profileCompletion}
      contacts={contacts}
      onEditProfile={goEditProfile}
    />
  )
}
