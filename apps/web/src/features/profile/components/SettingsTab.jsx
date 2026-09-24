// Settings: appearance, account + password, session, and service status.

import { useState } from 'react'
import { Palette, Sun, Moon, Monitor, Activity, Volume2 } from 'lucide-react'
import { getTheme, applyTheme } from '../../../services/theme'
import { Badge, Card, InfoRow, SegmentedControl, Switch } from '../../../components/ui'
import { getAutoRead, setAutoRead } from '../../chat/tts/autoRead'
import AuthSection from './AuthSection.jsx'

export default function SettingsTab({ isOffline, profile, onSignOut }) {
  const [theme, setTheme] = useState(getTheme)
  const choose = (t) => setTheme(applyTheme(t))
  const [autoRead, setAutoReadState] = useState(getAutoRead)
  const toggleAutoRead = (on) => { setAutoRead(on); setAutoReadState(on) }

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

      <Card title="Voice" icon={Volume2}>
        <Switch
          label="Auto-read replies to voice messages"
          description="When you speak a message, SankatAI reads its reply aloud. Every reply also has a play button."
          checked={autoRead}
          onChange={toggleAutoRead}
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
