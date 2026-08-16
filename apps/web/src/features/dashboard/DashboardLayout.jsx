import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { motion, AnimatePresence } from 'framer-motion'
import {
  HeartPulse, Menu, AlertTriangle, PanelRightOpen, Siren, X, Pencil, Check,
  Plus, Stethoscope, MapPin, FileText, Phone, ShieldCheck, ChevronRight, BadgeCheck,
} from 'lucide-react'
import { useProfile } from '../profile/context/ProfileContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import {
  listConsultations, createConsultation, getMessages, deleteConsultation, unsendMessage,
  renameConsultation, sendMessage as apiSendMessage, setMessageFeedback,
} from '../chat/services/chatApi'
import { ageFromDob, toBubble, TABS, PAGE_LABELS } from '../chat/utils/format.jsx'
import { uploadFile, listUploads } from '../../services/uploads'
import { DB_CSS } from './dashboard.styles'
import DashboardSkeleton from './DashboardSkeleton.jsx'

// The dashboard shell: persistent sidebar + header + <Outlet>. All shared state
// lives here (so it survives navigation between dashboard pages) and is handed
// to the page components through the router's Outlet context. The current URL —
// not local state — is the source of truth for which page is shown.
export default function DashboardLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const { profile, loading } = useProfile()

  const [navOpen, setNavOpen] = useState(false)
  const [initialLoading, setInitialLoading] = useState(true)
  const [consultations, setConsultations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [isEmergency, setIsEmergency] = useState(false)
  const [lastRiskScore, setLastRiskScore] = useState(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [hospitalError, setHospitalError] = useState('')
  const [attachMenuOpen, setAttachMenuOpen] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [chatAttachmentMap, setChatAttachmentMap] = useState({}) // id -> {kind, filename, downloadUrl}
  const [isListening, setIsListening] = useState(false)
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null) // null = not searching
  const [searching, setSearching] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null) // { id, title } | null
  const [renameValue, setRenameValue] = useState('')
  const [savingRename, setSavingRename] = useState(false)

  const docInputRef = useRef(null)
  const photoInputRef = useRef(null)
  const recognitionRef = useRef(null)

  const fullName = [profile?.firstName, profile?.middleName, profile?.lastName].filter(Boolean).join(' ') || 'Your profile'
  const firstName = profile?.firstName || 'there'
  const age = ageFromDob(profile?.dob)
  const contacts = Array.isArray(profile?.emergencyContacts) ? profile.emergencyContacts : []
  const primaryContact = contacts.find((c) => c.phone) || contacts[0]

  const profileCompletion = useMemo(() => {
    if (!profile) return 0
    const required = ['firstName', 'dob', 'gender', 'phone', 'email', 'bloodGroup']
    const filled = required.filter((f) => String(profile[f] || '').trim()).length
    return Math.round((filled / required.length) * 100)
  }, [profile])

  const loadConsultations = useCallback(async () => {
    try { const list = await listConsultations(); setConsultations(list); return list } catch { return [] }
  }, [])

  useEffect(() => {
    ;(async () => {
      try {
        const list = await loadConsultations()
        // Wait for the first conversation's messages before revealing the UI so
        // the real chat renders directly (no "New consultation" flash).
        if (list.length) await selectConsultation(list[0].consultationId)
      } finally {
        setInitialLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { fetch('/api/health').then((r) => setIsOffline(!r.ok)).catch(() => setIsOffline(true)) }, [])

  const loadChatAttachments = async (id) => {
    try {
      const list = await listUploads('chat', id)
      const map = {}
      for (const a of (Array.isArray(list) ? list : [])) map[a.attachmentId] = a
      setChatAttachmentMap(map)
    } catch { setChatAttachmentMap({}) }
  }
  const selectConsultation = async (id) => {
    setActiveId(id); setIsEmergency(false); setNavOpen(false)
    try { const msgs = await getMessages(id); setMessages(msgs.map(toBubble)) } catch { setMessages([]) }
    loadChatAttachments(id)
  }
  const startNewConsultation = async () => {
    try {
      const c = await createConsultation()
      setConsultations((prev) => [c, ...prev]); setActiveId(c.consultationId); setMessages([]); setIsEmergency(false); setNavOpen(false)
    } catch (e) { setHospitalError(e.message || 'Could not start a consultation.') }
  }
  const handleDelete = async (id, e) => {
    e.stopPropagation()
    try {
      await deleteConsultation(id)
      setConsultations((prev) => prev.filter((c) => c.consultationId !== id))
      if (activeId === id) { setActiveId(null); setMessages([]) }
    } catch { /* ignore */ }
  }
  const openRename = (consult, e) => {
    if (e) e.stopPropagation()
    setRenameTarget({ id: consult.consultationId, title: consult.title || '' })
    setRenameValue(consult.title || '')
  }
  const closeRename = () => { setRenameTarget(null); setRenameValue(''); setSavingRename(false) }
  const submitRename = async (e) => {
    if (e) e.preventDefault()
    const title = renameValue.trim()
    if (!renameTarget || !title || savingRename) return
    setSavingRename(true)
    try {
      const updated = await renameConsultation(renameTarget.id, title)
      const newTitle = updated?.title || title
      setConsultations((prev) => prev.map((c) => (c.consultationId === renameTarget.id ? { ...c, title: newTitle } : c)))
      closeRename()
    } catch (err) {
      setHospitalError(err.message || 'Could not rename the chat.')
      setSavingRename(false)
    }
  }

  const handleSend = async (e) => {
    e.preventDefault()
    const text = input.trim()
    // Only fully-uploaded attachments can be sent with the message.
    const ready = attachments.filter((a) => a.status === 'uploaded' && a.attachmentId)
    if ((!text && ready.length === 0) || isLoading) return
    setInput(''); setIsLoading(true)
    const tmpId = `tmp-${Date.now()}`
    const attachmentIds = ready.map((a) => a.attachmentId)
    // Carry local previews so the just-sent bubble shows thumbnails immediately.
    const msgAttachments = ready.map((a) => ({ attachmentId: a.attachmentId, kind: a.kind, name: a.name, url: a.previewUrl || null }))
    setAttachments([]) // they now belong to the message
    let cid = activeId
    try {
      if (!cid) { const c = await createConsultation(); setConsultations((prev) => [c, ...prev]); cid = c.consultationId; setActiveId(cid) }
      // Optimistic: show the message immediately with a SINGLE tick.
      setMessages((prev) => [...prev, { id: tmpId, sender: 'user', text, createdAt: new Date().toISOString(), status: 'sent', attachments: msgAttachments }])
      const res = await apiSendMessage(cid, text, attachmentIds)
      // Backend accepted -> DOUBLE tick. Merge fresh attachment URLs into the map.
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: 'received' } : m)))
      if (attachmentIds.length) loadChatAttachments(cid)
      setIsOffline(Boolean(res.isOfflineFallback))
      if (res.assistantMessage) {
        const bot = toBubble(res.assistantMessage)
        setMessages((prev) => [...prev, bot])
        if (bot.riskScore != null) setLastRiskScore(bot.riskScore)
        if (bot.severity === 'EMERGENCY') setIsEmergency(true)
      }
      loadConsultations()
    } catch (err) {
      // Request failed: leave the user message at a SINGLE tick (still 'sent').
      setMessages((prev) => [...prev, { id: `err-${Date.now()}`, sender: 'bot', text: err.message || 'Service unavailable. Please try again.', createdAt: new Date().toISOString() }])
    } finally { setIsLoading(false) }
  }

  // Like/dislike an AI response. Toggling the active choice clears it. Optimistic
  // with revert on failure. Feedback is scoped to the current conversation.
  const submitFeedback = async (messageId, feedback) => {
    if (!activeId || !messageId) return
    const current = messages.find((m) => m.id === messageId)?.feedback ?? null
    const next = current === feedback ? null : feedback
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback: next } : m)))
    try {
      await setMessageFeedback(activeId, messageId, next)
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback: current } : m)))
      setHospitalError(err.message || 'Could not save your feedback.')
    }
  }
  const { signOut } = useAuth()
  useEffect(() => {
    const q = search.trim()
    if (!q) { setSearchResults(null); setSearching(false); return undefined }
    setSearching(true)
    const t = setTimeout(async () => {
      try { setSearchResults(await listConsultations(q)) }
      catch { setSearchResults([]) }
      finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(t)
  }, [search])

  const visibleConsultations = search.trim() ? (searchResults ?? []) : consultations

  // Unsend: server marks the row deleted (kept for audit), UI drops it.
  const unsendMessageById = async (messageId) => {
    if (!activeId || !messageId) return
    const prev = messages
    setMessages((p) => p.filter((m) => m.id !== messageId))
    try { await unsendMessage(activeId, messageId) } catch { setMessages(prev) }
  }

  const handleSignOut = async () => { await signOut(); navigate('/login', { replace: true }) }

  // Chat attachments upload directly to the transient chat bucket (scope=chat),
  // associated with the active consultation. Each chip reflects its status.
  const onFilesSelected = (kind) => async (e) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''; setAttachMenuOpen(false)
    if (!picked.length) return
    if (!activeId) { setHospitalError('Open or start a consultation before attaching files.'); return }
    for (const f of picked) {
      const localId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const previewUrl = kind === 'photo' ? URL.createObjectURL(f) : null
      setAttachments((prev) => [...prev, { localId, name: f.name, kind, status: 'uploading', previewUrl }])
      try {
        const rec = await uploadFile(f, { scope: 'chat', kind, chatId: activeId })
        setAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, status: 'uploaded', attachmentId: rec.attachmentId } : a)))
      } catch (err) {
        setAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, status: 'failed' } : a)))
        setHospitalError(err.message || `Could not upload ${f.name}.`)
      }
    }
  }
  const removeAttachment = (idx) => setAttachments((prev) => prev.filter((_, i) => i !== idx))

  const handleVoice = () => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition
    if (!SR) { setHospitalError('Voice input is not supported in this browser.'); return }
    if (isListening) { recognitionRef.current?.stop(); return }
    const rec = new SR(); rec.lang = 'en-US'; rec.interimResults = false; rec.maxAlternatives = 1
    rec.onresult = (ev) => { const t = ev.results?.[0]?.[0]?.transcript; if (t) setInput((prev) => (prev ? `${prev} ${t}` : t)) }
    rec.onend = () => setIsListening(false); rec.onerror = () => setIsListening(false)
    recognitionRef.current = rec; setIsListening(true); rec.start()
  }
  const handleFindHospitals = () => {
    if (!navigator.geolocation) return setHospitalError('Geolocation not supported.')
    navigator.geolocation.getCurrentPosition(
      (pos) => { window.location.href = `https://www.google.com/maps/search/hospitals/@${pos.coords.latitude},${pos.coords.longitude},14z` },
      () => setHospitalError('Location permission denied.'),
    )
  }
  const handleSendLocationAlert = () => {
    if (!primaryContact?.phone || !navigator.geolocation) return
    navigator.geolocation.getCurrentPosition((pos) => {
      const link = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`
      const body = encodeURIComponent(`Medical Emergency! My location: ${link}`)
      window.location.href = `sms:${primaryContact.phone}?body=${body}`
    })
  }

  const goChat = () => navigate('/dashboard/chat')
  const goEditProfile = () => navigate('/profile-setup')
  const triggerSos = () => { goChat(); setIsEmergency(true) }

  const isChat = location.pathname === '/dashboard/chat'
  const activeLabel = TABS.find((t) => t.path === location.pathname)?.label || PAGE_LABELS[location.pathname] || ''

  // While the session/profile is initializing, show the full skeleton in place
  // of the shell.
  if (loading) return <DashboardSkeleton />

  // Everything the page components need, handed down via the Outlet context.
  const outletContext = {
    consultations, activeId, messages, input, setInput, isLoading,
    isEmergency, setIsEmergency, lastRiskScore, analysisOpen, setAnalysisOpen,
    attachMenuOpen, setAttachMenuOpen, attachments, removeAttachment, isListening,
    chatAttachmentMap,
    search, setSearch, searching, visibleConsultations, docInputRef, photoInputRef,
    selectConsultation, startNewConsultation, handleDelete, openRename,
    handleSend, handleVoice, handleFindHospitals, handleSendLocationAlert, submitFeedback,
    isOffline, profile, fullName, firstName, age, profileCompletion, contacts, primaryContact,
    handleSignOut, goEditProfile, goChat, unsendMessageById,
  }

  return (
    <div className="db-shell">
      <style>{DB_CSS}</style>
      {/* Initial data (consultation list + first conversation) still loading —
          overlay the skeleton so the real chat appears without a flash. */}
      {initialLoading && <DashboardSkeleton />}

      {/* ══ 20% — tab rail ══ */}
      <nav className={`db-tabs ${navOpen ? 'open' : ''}`}>
        <div className="db-brand">
          <span className="db-brand-mark"><HeartPulse size={22} /></span>
          <span className="db-brand-text">
            <span className="db-brand-name">Sankat<b>.AI</b></span>
            <span className="db-brand-sub">AI Health Assistant</span>
          </span>
        </div>

        <button type="button" className="db-newchat" onClick={startNewConsultation}>
          <Plus size={17} /> New Chat
        </button>

        <div className="db-tab-list">
          {TABS.map((t) => (
            <NavLink
              key={t.key}
              to={t.path}
              className={({ isActive }) => `db-tab ${isActive ? 'active' : ''}`}
              onClick={() => setNavOpen(false)}
            >
              <t.Icon size={18} /> {t.label}
            </NavLink>
          ))}
        </div>
        <div className="db-quick">
          <span className="db-quick-title">Quick Actions</span>
          <button type="button" className="db-quick-item" onClick={goChat}>
            <span className="db-quick-ic"><Stethoscope size={17} /></span>
            <span className="db-quick-text"><b>Symptom Checker</b><span>Check your symptoms</span></span>
          </button>
          <button type="button" className="db-quick-item" onClick={handleFindHospitals}>
            <span className="db-quick-ic"><MapPin size={17} /></span>
            <span className="db-quick-text"><b>Find Nearby Hospitals</b><span>Hospitals near you</span></span>
          </button>
          <button type="button" className="db-quick-item" onClick={() => navigate('/documents/upload')}>
            <span className="db-quick-ic"><FileText size={17} /></span>
            <span className="db-quick-text"><b>Upload Reports</b><span>Get AI analysis</span></span>
          </button>
          <button type="button" className="db-quick-item danger" onClick={triggerSos}>
            <span className="db-quick-ic"><Phone size={17} /></span>
            <span className="db-quick-text"><b>Emergency SOS</b><span>Call for immediate help</span></span>
          </button>
        </div>

        <div className="db-disclaimer">
          <span className="db-disclaimer-head"><ShieldCheck size={15} /> Disclaimer</span>
          <p>SankatAI is not a substitute for professional medical advice, diagnosis or treatment. In life-threatening situations, call emergency services immediately.</p>
        </div>

        {/* profile card sits last, under the disclaimer */}
        <NavLink to="/dashboard/profile" className="db-tab-user" onClick={() => setNavOpen(false)}>
          <div className="db-tab-avatar">{(profile?.firstName?.[0] || 'U').toUpperCase()}</div>
          <div className="db-tab-userinfo"><span className="db-tab-name">{fullName}</span><span className="db-tab-email">View profile</span></div>
          <ChevronRight size={16} className="db-tab-user-chev" />
        </NavLink>
      </nav>
      {navOpen && <div className="db-scrim" onClick={() => setNavOpen(false)} />}

      {/* ══ 80% — content ══ */}
      <main className="db-content">
        <header className="db-topbar">
          <button className="db-icon-ghost only-mobile" onClick={() => setNavOpen(true)} aria-label="Menu"><Menu size={18} /></button>
          {isChat ? (
            <div className="db-topbrand">
              <span className="db-topbrand-name">SankatAI <BadgeCheck size={16} /></span>
              <span className="db-topbrand-status"><i /> Always here to help</span>
            </div>
          ) : (
            <h2 className="db-topbar-title">{activeLabel}</h2>
          )}
          {isOffline && (
            <NavLink to="/dashboard/offline" className="db-offline" title="Offline mode"><AlertTriangle size={13} /> Offline backup</NavLink>
          )}
          <div className="db-spacer" />
          {isChat && (
            <button className="db-icon-ghost" onClick={() => setAnalysisOpen(true)} title="AI analysis"><PanelRightOpen size={18} /></button>
          )}
          <button className="db-sos" onClick={triggerSos}><Siren size={15} /> SOS</button>
        </header>

        <Outlet context={outletContext} />
      </main>

      {/* hidden file pickers (shared by the chat attach menu) */}
      <input ref={docInputRef} type="file" multiple hidden accept=".pdf,.doc,.docx,.txt,.rtf,.odt,.ppt,.pptx,.xls,.xlsx,.csv" onChange={onFilesSelected('document')} />
      <input ref={photoInputRef} type="file" multiple hidden accept="image/*" onChange={onFilesSelected('photo')} />

      {/* Rename chat modal */}
      <AnimatePresence>
        {renameTarget && (
          <motion.div className="dx-modal-scrim" onClick={closeRename} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <motion.form
              className="dx-modal"
              onClick={(e) => e.stopPropagation()}
              onSubmit={submitRename}
              initial={{ opacity: 0, y: 14, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 14, scale: 0.98 }}
              transition={{ duration: 0.18 }}
            >
              <div className="dx-modal-head"><span><Pencil size={15} /> Rename chat</span><button type="button" className="db-icon-ghost" onClick={closeRename}><X size={16} /></button></div>
              <input
                className="dx-modal-input"
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                placeholder="Chat name"
                maxLength={120}
                autoFocus
                onKeyDown={(e) => { if (e.key === 'Escape') closeRename() }}
              />
              <div className="dx-modal-actions">
                <button type="button" className="dx-mbtn ghost" onClick={closeRename} disabled={savingRename}>Cancel</button>
                <button type="submit" className="dx-mbtn primary" disabled={!renameValue.trim() || savingRename}>{savingRename ? 'Saving…' : <><Check size={15} /> Save</>}</button>
              </div>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {hospitalError && <motion.div className="dx-toast" onClick={() => setHospitalError('')} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 12 }}>{hospitalError}</motion.div>}
      </AnimatePresence>
    </div>
  )
}
