// Settings tab — presentational, except the self-contained Appearance control.

import { useState } from 'react'
import { Settings, Pencil, MessageSquare, Activity, Palette, Sun, Moon } from 'lucide-react'
import { getTheme, applyTheme } from '../../../services/theme'
import AuthSection from './AuthSection.jsx'

export default function SettingsTab({ isOffline, profile, onEditProfile, onGoChat, onSignOut }) {
  const [theme, setTheme] = useState(getTheme)
  const choose = (t) => setTheme(applyTheme(t))

  return (
    <div className="db-view scroll-view">
      <div className="db-cards">
        <section className="dx-card">
          <div className="dx-card-title"><Settings size={15} /> Settings</div>
          <button className="dx-setting-btn" onClick={onEditProfile}><Pencil size={15} /> Edit profile</button>
          <button className="dx-setting-btn" onClick={onGoChat}><MessageSquare size={15} /> Go to chat</button>
        </section>

        <AuthSection profile={profile} onSignOut={onSignOut} />

        <section className="dx-card">
          <div className="dx-card-title"><Palette size={15} /> Appearance</div>
          <div className="dx-theme-toggle" role="radiogroup" aria-label="Theme">
            <button type="button" role="radio" aria-checked={theme === 'light'} className={`dx-theme-btn ${theme === 'light' ? 'active' : ''}`} onClick={() => choose('light')}><Sun size={15} /> Light</button>
            <button type="button" role="radio" aria-checked={theme === 'dark'} className={`dx-theme-btn ${theme === 'dark' ? 'active' : ''}`} onClick={() => choose('dark')}><Moon size={15} /> Dark</button>
          </div>
        </section>

        <section className="dx-card">
          <div className="dx-card-title"><Activity size={15} /> Status</div>
          <div className="info-row"><span className="info-row-label">AI service</span><span className="info-row-value">{isOffline ? 'Offline (backup mode)' : 'Online'}</span></div>
          <div className="info-row"><span className="info-row-label">Signed in as</span><span className="info-row-value">{profile?.email || '—'}</span></div>
        </section>
      </div>
    </div>
  )
}
