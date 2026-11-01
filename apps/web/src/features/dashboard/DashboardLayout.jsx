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
  PanelRightOpen, PanelLeftClose, PanelLeftOpen, ShieldCheck, ChevronRight, CloudOff, User, Activity,
  GitCommitHorizontal, FlaskConical, Stethoscope,
} from 'lucide-react'
import { useDashboard } from './useDashboard'
import { SHELL_CSS } from './shell.styles'
import { ContentSkeleton } from './DashboardSkeleton.jsx'
import EmergencyPanel from '../emergency/components/EmergencyPanel.jsx'
import RenameChatModal from '../chat/components/RenameChatModal.jsx'
import DoctorReportModal, { DOCTOR_REPORT_CSS } from '../health/components/DoctorReport.jsx'
import { AI_DISCLAIMER } from '@sankatai/shared'
import { Alert, Avatar, Badge, Brand, Button, IconButton, Modal, SkipLink, pageEnter } from '../../components/ui'

// Two groups: talking to the assistant, and your own health record.
const NAV_GROUPS = [
  { label: 'Care', items: [
    { key: 'chat', label: 'Chat', short: 'Chat', Icon: MessageSquare, path: '/dashboard/chat' },
    { key: 'history', label: 'Chat history', short: 'History', Icon: Clock, path: '/dashboard/history' },
    { key: 'emergency', label: 'Emergency', short: 'SOS', Icon: Siren, path: '/dashboard/emergency' },
  ] },
  { label: 'My health', items: [
    { key: 'timeline', label: 'Timeline', short: 'Timeline', Icon: GitCommitHorizontal, path: '/dashboard/timeline' },
    { key: 'symptoms', label: 'Symptoms', short: 'Symptoms', Icon: Activity, path: '/dashboard/symptoms' },
    { key: 'reports', label: 'Lab reports', short: 'Reports', Icon: FlaskConical, path: '/dashboard/reports' },
    { key: 'files', label: 'Documents', short: 'Files', Icon: FolderOpen, path: '/dashboard/files' },
  ] },
]
const ITEMS = Object.fromEntries(NAV_GROUPS.flatMap((g) => g.items).map((i) => [i.key, i]))
const BOTTOM = ['chat', 'history', 'timeline', 'emergency'].map((k) => ITEMS[k]) // <768 tab bar; the rest is under More
const TITLES = {
  '/dashboard/chat': 'Symptom chat',
  '/dashboard/history': 'Chat history',
  '/dashboard/files': 'Documents',
  '/dashboard/emergency': 'Emergency',
  '/dashboard/timeline': 'Health timeline',
  '/dashboard/symptoms': 'Symptoms',
  '/dashboard/reports': 'Lab reports',
  '/dashboard/settings': 'Settings',
  '/dashboard/profile': 'Health profile',
  '/dashboard/offline': 'Offline mode',
}
const MORE_PATHS = ['/dashboard/symptoms', '/dashboard/reports', '/dashboard/files',
  '/dashboard/settings', '/dashboard/profile', '/dashboard/offline']
const SIDE_KEY = 'sankatai.sidebar.hidden'
const loadHidden = () => { try { return localStorage.getItem(SIDE_KEY) === '1' } catch { return false } }

export default function DashboardLayout() {
  const { refs, ...d } = useDashboard()
  const { docInputRef, photoInputRef } = refs
  const [reportFor, setReportFor] = useState(null) // { consultationId, title }: doctor report for that chat
  const outlet = { ...d, docInputRef, photoInputRef, openDoctorReport: (c) => setReportFor({ kind: 'chat', ...c }) }
  const location = useLocation()
  const navigate = useNavigate()
  const [moreOpen, setMoreOpen] = useState(false)
  const [sideHidden, setSideHidden] = useState(loadHidden)
  const toggleSide = () => setSideHidden((h) => { try { localStorage.setItem(SIDE_KEY, h ? '0' : '1') } catch { /* preference only */ } return !h })

  const path = location.pathname
  const isChat = path === '/dashboard/chat'
  const isCanvas = path === '/dashboard/timeline' // full-bleed, like chat
  const title = isChat ? '' : (TITLES[path] || '')
  const contentLoading = d.loading || d.initialLoading

  const newChat = async () => { setMoreOpen(false); const c = await d.startNewConsultation(); if (c) navigate('/dashboard/chat') }
  const go = (to) => { setMoreOpen(false); navigate(to) }

  return (
    <div className={`sh${sideHidden ? ' sh--side-hidden' : ''}`}>
      <style>{SHELL_CSS}{DOCTOR_REPORT_CSS}</style>
      <SkipLink />

      {/* ≥768px: side nav (full ≥1024, icon rail below) */}
      <nav className="sh-side" aria-label="Main">
        <NavLink to="/dashboard/chat" className="sh-side-brand" aria-label="SankatAI — symptom chat">
          <Brand className="sh-brand-full" />
          <span className="ui-brand-mark sh-brand-mark" aria-hidden="true"><HeartPulse size={18} strokeWidth={2.25} /></span>
        </NavLink>

        <Button variant="secondary" icon={Plus} block className="sh-newchat-full" onClick={newChat}>New chat</Button>
        <IconButton label="New chat" icon={Plus} variant="secondary" className="sh-newchat-icon" tooltipSide="bottom" onClick={newChat} />

        {NAV_GROUPS.map((g) => (
          <div key={g.label} className="sh-group" role="group" aria-labelledby={`sh-g-${g.label}`}>
            <p id={`sh-g-${g.label}`} className="ui-overline sh-group-label">{g.label}</p>
            <ul role="list" className="sh-nav">
              {g.items.map((t) => (
                <li key={t.key}>
                  <NavLink to={t.path} className="sh-nav-item">
                    <t.Icon size={18} aria-hidden="true" />
                    <span className="sh-nav-label">{t.label}</span>
                    <span className="sh-nav-short" aria-hidden="true">{t.short}</span>
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}

        <div className="sh-side-extra">
          <NavLink to="/dashboard/settings" className="sh-nav-item">
            <Settings size={18} aria-hidden="true" /><span className="sh-nav-label">Settings</span>
          </NavLink>
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
          <IconButton label={sideHidden ? 'Show menu' : 'Hide menu'} icon={sideHidden ? PanelLeftOpen : PanelLeftClose}
            className="sh-bar-sidetoggle" aria-expanded={!sideHidden} onClick={toggleSide} tooltipSide="bottom" />
          <span className={`ui-brand-mark sh-bar-mark${isChat ? ' sh-bar-mark--hide' : ''}`} aria-hidden="true"><HeartPulse size={16} strokeWidth={2.25} /></span>
          {title ? <h1 className="sh-bar-title">{title}</h1> : <h1 className="sr-only">Chat</h1>}
          {d.isOffline && (
            <Badge tone="warning" icon={CloudOff} href="/dashboard/offline" onClick={(e) => { e.preventDefault(); navigate('/dashboard/offline') }}>AI offline</Badge>
          )}
          <div className="sh-bar-actions">
            {isChat && <IconButton label="New chat" icon={Plus} className="sh-bar-newchat" onClick={newChat} tooltipSide="bottom" />}
            {isChat && d.activeId && (
              <Button variant="ghost" size="sm" icon={Stethoscope} className="sh-bar-analysis" aria-label="Doctor report for this chat"
                onClick={() => setReportFor({ kind: 'chat', ...(d.consultations.find((c) => c.consultationId === d.activeId) || { consultationId: d.activeId }) })}>
                <span className="ui-btn-text">Doctor report</span>
              </Button>
            )}
            {isChat && (
              <Button variant="ghost" size="sm" icon={PanelRightOpen} className="sh-bar-analysis" aria-label="AI analysis" aria-haspopup="dialog" onClick={() => d.setAnalysisOpen(true)}>
                <span className="ui-btn-text">AI analysis</span>
              </Button>
            )}
            <Button variant="emergency" icon={Siren} onClick={d.triggerSos} aria-label="SOS — get emergency help now">SOS</Button>
          </div>
        </header>

        {d.isEmergency && (
          <EmergencyPanel
            fromAssessment={d.emergencyFromAssessment}
            reasons={d.emergencyReasons}
            riskScore={d.lastRiskScore}
            primaryContact={d.primaryContact}
            contactsLoading={d.loading}
            onShareLocation={d.handleSendLocationAlert}
            onFindHospitals={d.handleFindHospitals}
            onDismiss={() => d.setIsEmergency(false)}
          />
        )}

        {d.profileError && !d.loading && (
          <div className="sh-notice">
            <Alert tone="danger" title="Couldn't load your health profile." action={<Button size="sm" variant="secondary" onClick={() => d.reloadProfile()}>Try again</Button>}>
              Some details may be missing until it loads. Emergency calling still works.
            </Alert>
          </div>
        )}

        <main id="main" tabIndex={-1} className={`sh-content ${isChat || isCanvas ? 'sh-content--chat' : ''}`}>
          {contentLoading ? <ContentSkeleton variant={isChat ? 'chat' : 'list'} /> : (
            // Emergency content (the Emergency page, and Chat, which can carry
            // EMERGENCY assessments with Call 108) is never behind an entrance animation.
            path === '/dashboard/emergency' || isChat || isCanvas
              ? <Outlet context={outlet} />
              : <motion.div key={path} className="sh-page" {...pageEnter}><Outlet context={outlet} /></motion.div>
          )}
        </main>
      </div>

      {/* <768px: bottom tab bar, thumb-reachable */}
      <nav className="sh-bottom" aria-label="Main">
        {BOTTOM.map((t) => (
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
        <p className="ui-overline sh-more-label">My health</p>
        <ul role="list" className="sh-more">
          {['symptoms', 'reports', 'files'].map((k) => ITEMS[k]).map((t) => (
            <li key={t.key}><button type="button" className="sh-more-item" onClick={() => go(t.path)}><t.Icon size={20} aria-hidden="true" />{t.label}</button></li>
          ))}
        </ul>
        <p className="ui-overline sh-more-label">Account</p>
        <ul role="list" className="sh-more">
          <li><button type="button" className="sh-more-item" onClick={() => go('/dashboard/profile')}><User size={20} aria-hidden="true" />Health profile</button></li>
          <li><button type="button" className="sh-more-item" onClick={() => go('/dashboard/settings')}><Settings size={20} aria-hidden="true" />Settings</button></li>
        </ul>
        <div className="sh-disclaimer sh-disclaimer--sheet"><ShieldCheck size={16} aria-hidden="true" /><p>{AI_DISCLAIMER}</p></div>
      </Modal>

      {/* hidden file pickers (shared by the chat attach menu) */}
      <input ref={docInputRef} type="file" multiple hidden accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.ppt,.pptx,.xls,.xlsx,.csv" onChange={d.onFilesSelected('document')} />
      <input ref={photoInputRef} type="file" multiple hidden accept="image/jpeg,image/png,image/webp,image/heic,image/heif" onChange={d.onFilesSelected('photo')} />

      <RenameChatModal target={d.renameTarget} onClose={d.closeRename} onRename={d.renameChat} />
      {reportFor && <DoctorReportModal source={reportFor} onClose={() => setReportFor(null)} />}
    </div>
  )
}
