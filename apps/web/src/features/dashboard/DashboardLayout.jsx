// The dashboard shell: navigation + app bar + <Outlet>. State lives in
// useDashboard() and reaches pages through the router's Outlet context.
//
// Navigation per breakpoint (DESIGN_SYSTEM.md): full side nav ≥1024px, compact
// icon rail 768–1023px, bottom tab bar <768px. SOS is in the app bar at every
// size and is never covered: while data loads, only the CONTENT area shows a
// skeleton — the shell (and SOS) is live from the first paint.

import { useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { motion } from 'framer-motion'
import {
  HeartPulse, MessageSquare, Clock, FolderOpen, Siren, Settings, MoreHorizontal, Plus,
  PanelRightOpen, MapPin, Upload, ShieldCheck, ChevronRight, CloudOff, User,
} from 'lucide-react'
import { useDashboard } from './useDashboard'
import { SHELL_CSS } from './shell.styles'
import { ContentSkeleton } from './DashboardSkeleton.jsx'
import EmergencyPanel from '../emergency/components/EmergencyPanel.jsx'
import RenameChatModal from '../chat/components/RenameChatModal.jsx'
import { AI_DISCLAIMER } from '@sankatai/shared'
import { Avatar, Badge, Brand, Button, IconButton, Modal, SkipLink, pageEnter } from '../../components/ui'

const NAV = [
  { key: 'chat', label: 'Chat', short: 'Chat', Icon: MessageSquare, path: '/dashboard/chat' },
  { key: 'history', label: 'History', short: 'History', Icon: Clock, path: '/dashboard/history' },
  { key: 'files', label: 'Documents', short: 'Files', Icon: FolderOpen, path: '/dashboard/files' },
  { key: 'emergency', label: 'Emergency', short: 'Emergency', Icon: Siren, path: '/dashboard/emergency' },
  { key: 'settings', label: 'Settings', short: 'Settings', Icon: Settings, path: '/dashboard/settings' },
]
const TITLES = {
  '/dashboard/chat': 'Symptom chat',
  '/dashboard/history': 'Chat history',
  '/dashboard/files': 'Documents',
  '/dashboard/emergency': 'Emergency',
  '/dashboard/settings': 'Settings',
  '/dashboard/profile': 'Health profile',
  '/dashboard/offline': 'Offline mode',
}
const MORE_PATHS = ['/dashboard/settings', '/dashboard/profile', '/dashboard/offline']

export default function DashboardLayout() {
  const { refs, ...d } = useDashboard()
  const { docInputRef, photoInputRef } = refs
  const outlet = { ...d, docInputRef, photoInputRef }
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)

  const path = location.pathname
  const isChat = path === '/dashboard/chat'
  const title = TITLES[path] || ''
  const contentLoading = d.loading || d.initialLoading

  const newChat = async () => { setMoreOpen(false); const c = await d.startNewConsultation(); if (c) navigate('/dashboard/chat') }
  const go = (to) => { setMoreOpen(false); navigate(to) }

  return (
    <div className="sh">
      <style>{SHELL_CSS}</style>
      <SkipLink />

      {/* ≥768px: side nav (full ≥1024, icon rail below) */}
      <nav className="sh-side" aria-label="Main">
        <NavLink to="/dashboard/chat" className="sh-side-brand" aria-label="SankatAI — symptom chat">
          <Brand className="sh-brand-full" />
          <HeartPulse size={24} className="sh-brand-mark" aria-hidden="true" />
        </NavLink>

        <Button variant="secondary" icon={Plus} block className="sh-newchat-full" onClick={newChat}>New chat</Button>
        <IconButton label="New chat" icon={Plus} variant="secondary" className="sh-newchat-icon" tooltipSide="bottom" onClick={newChat} />

        <ul role="list" className="sh-nav">
          {NAV.map((t) => (
            <li key={t.key}>
              <NavLink to={t.path} className="sh-nav-item">
                <t.Icon size={20} aria-hidden="true" />
                <span className="sh-nav-label">{t.label}</span>
                <span className="sh-nav-short" aria-hidden="true">{t.short}</span>
              </NavLink>
            </li>
          ))}
        </ul>

        <div className="sh-side-extra">
          <p className="ui-overline sh-side-heading">Quick actions</p>
          <ul role="list" className="sh-nav">
            <li><button type="button" className="sh-nav-item" onClick={d.handleFindHospitals}><MapPin size={20} aria-hidden="true" /><span className="sh-nav-label">Find nearby hospitals</span></button></li>
            <li><button type="button" className="sh-nav-item" onClick={() => navigate('/documents/upload')}><Upload size={20} aria-hidden="true" /><span className="sh-nav-label">Upload a report</span></button></li>
          </ul>

          <div className="sh-disclaimer">
            <ShieldCheck size={16} aria-hidden="true" />
            <p>{AI_DISCLAIMER}</p>
          </div>
        </div>

        <NavLink to="/dashboard/profile" className="sh-user" aria-label={`${d.fullName} — health profile`}>
          <Avatar name={d.profile?.firstName} />
          <span className="sh-user-text"><span className="sh-user-name">{d.fullName}</span><span className="sh-user-sub">Health profile</span></span>
          <ChevronRight size={16} className="sh-user-chev" aria-hidden="true" />
        </NavLink>
      </nav>

      <div className="sh-main">
        <header className="sh-bar">
          <HeartPulse size={22} className="sh-bar-mark" aria-hidden="true" />
          <h1 className="sh-bar-title">{title}</h1>
          {d.isOffline && (
            <Badge tone="warning" icon={CloudOff} href="/dashboard/offline" onClick={(e) => { e.preventDefault(); navigate('/dashboard/offline') }}>AI offline</Badge>
          )}
          <div className="sh-bar-actions">
            {isChat && <IconButton label="New chat" icon={Plus} className="sh-bar-newchat" onClick={newChat} tooltipSide="bottom" />}
            {isChat && <IconButton label="AI analysis" icon={PanelRightOpen} onClick={() => d.setAnalysisOpen(true)} tooltipSide="bottom" tooltipAlign="end" />}
            <Button variant="emergency" size="sm" icon={Siren} onClick={d.triggerSos} aria-label="SOS — get emergency help now">SOS</Button>
          </div>
        </header>

        {d.isEmergency && (
          <EmergencyPanel
            fromAssessment={d.emergencyFromAssessment}
            riskScore={d.lastRiskScore}
            primaryContact={d.primaryContact}
            onShareLocation={d.handleSendLocationAlert}
            onFindHospitals={d.handleFindHospitals}
            onDismiss={() => d.setIsEmergency(false)}
          />
        )}

        <main id="main" tabIndex={-1} className={`sh-content ${isChat ? 'sh-content--chat' : ''}`}>
          {contentLoading ? <ContentSkeleton variant={isChat ? 'chat' : 'list'} /> : (
            // Emergency content (the Emergency page, and Chat, which can carry
            // EMERGENCY assessments with Call 108) is never behind an entrance animation.
            path === '/dashboard/emergency' || isChat
              ? <Outlet context={outlet} />
              : <motion.div key={path} className="sh-page" {...pageEnter}><Outlet context={outlet} /></motion.div>
          )}
        </main>
      </div>

      {/* <768px: bottom tab bar, thumb-reachable */}
      <nav className="sh-bottom" aria-label="Main">
        {NAV.slice(0, 4).map((t) => (
          <NavLink key={t.key} to={t.path} className="sh-tab">
            <t.Icon size={22} aria-hidden="true" /><span>{t.short}</span>
          </NavLink>
        ))}
        <button
          type="button"
          className={`sh-tab ${MORE_PATHS.includes(path) ? 'active' : ''}`}
          aria-current={MORE_PATHS.includes(path) ? 'page' : undefined}
          aria-haspopup="dialog"
          onClick={() => setMoreOpen(true)}
        >
          <MoreHorizontal size={22} aria-hidden="true" /><span>More</span>
        </button>
      </nav>

      <Modal open={moreOpen} onClose={() => setMoreOpen(false)} title="More">
        <ul role="list" className="sh-more">
          <li><button type="button" className="sh-more-item" onClick={() => go('/dashboard/profile')}><User size={20} aria-hidden="true" />Health profile</button></li>
          <li><button type="button" className="sh-more-item" onClick={() => go('/dashboard/settings')}><Settings size={20} aria-hidden="true" />Settings</button></li>
          <li><button type="button" className="sh-more-item" onClick={() => go('/documents/upload')}><Upload size={20} aria-hidden="true" />Upload a report</button></li>
          <li><button type="button" className="sh-more-item" onClick={() => { setMoreOpen(false); d.handleFindHospitals() }}><MapPin size={20} aria-hidden="true" />Find nearby hospitals</button></li>
        </ul>
        <div className="sh-disclaimer sh-disclaimer--sheet"><ShieldCheck size={16} aria-hidden="true" /><p>{AI_DISCLAIMER}</p></div>
      </Modal>

      {/* hidden file pickers (shared by the chat attach menu) */}
      <input ref={docInputRef} type="file" multiple hidden accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.ppt,.pptx,.xls,.xlsx,.csv" onChange={d.onFilesSelected('document')} />
      <input ref={photoInputRef} type="file" multiple hidden accept="image/*" onChange={d.onFilesSelected('photo')} />

      <RenameChatModal target={d.renameTarget} onClose={d.closeRename} onRename={d.renameChat} />
    </div>
  )
}
