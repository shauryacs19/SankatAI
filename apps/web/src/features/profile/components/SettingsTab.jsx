// Settings: appearance, account + password, session, and service status.

import { useState } from 'react'
import { Palette, Sun, Moon, Monitor, Activity, Volume2, Type } from 'lucide-react'
import { getTheme, applyTheme } from '../../../services/theme'
import { getTextSize, applyTextSize } from '../../../services/textSize'
import { Badge, Card, InfoRow, SegmentedControl, Switch } from '../../../components/ui'
import { getAutoRead, setAutoRead } from '../../chat/tts/autoRead'
import AuthSection from './AuthSection.jsx'

export default function SettingsTab({ isOffline, profile, onSignOut }) {
  const [theme, setTheme] = useState(getTheme)
  const choose = (t) => setTheme(applyTheme(t))
  const [textSize, setTextSize] = useState(getTextSize)
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

      <Card title="Text size" icon={Type} description="Changes the size of text across SankatAI on this device.">
        <SegmentedControl
          label="Text size"
          block
          value={textSize}
          onChange={(s) => setTextSize(applyTextSize(s))}
          options={[
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
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
