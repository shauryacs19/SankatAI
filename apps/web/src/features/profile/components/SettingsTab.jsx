// Settings: appearance, account + password, session, and service status.

import { useState } from 'react'
import { Palette, Sun, Moon, Monitor, Activity } from 'lucide-react'
import { getTheme, applyTheme } from '../../../services/theme'
import { Badge, Card, InfoRow, SegmentedControl } from '../../../components/ui'
import AuthSection from './AuthSection.jsx'

export default function SettingsTab({ isOffline, profile, onSignOut }) {
  const [theme, setTheme] = useState(getTheme)
  const choose = (t) => setTheme(applyTheme(t))

  return (
    <div className="pg">
      <Card title="Appearance" icon={Palette} description="System follows your device's light or dark setting.">
        <SegmentedControl
          label="Theme"
          block
          value={theme}
          onChange={choose}
          options={[
            { value: 'light', label: 'Light', icon: Sun },
            { value: 'dark', label: 'Dark', icon: Moon },
            { value: 'system', label: 'System', icon: Monitor },
          ]}
        />
      </Card>

      <AuthSection profile={profile} onSignOut={onSignOut} />

      <Card title="Service status" icon={Activity}>
        <div className="ui-rows">
          <InfoRow
            label="AI assistant"
            value={isOffline
              ? <Badge tone="warning">Offline — answers are keyword estimates</Badge>
              : <Badge tone="success">Online</Badge>}
          />
        </div>
      </Card>
    </div>
  )
}
