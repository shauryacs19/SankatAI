// All dashboard state and handlers (moved verbatim from DashboardLayout, which
// is now presentational). Lives above the <Outlet> so it survives navigation
// between dashboard pages. Behaviour changes vs the original, all approved in
// DESIGN_AUDIT.md (D5): failed sends become a retryable error row instead of a
// fake AI message; hospital search opens in a new tab; location sharing and
// deletes report failures instead of failing silently; the chat list tracks a
// load error so History can offer a retry.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProfile } from '../profile/context/ProfileContext.jsx'
import { useAuth } from '../../context/AuthContext.jsx'
import {
  listConsultations, createConsultation, getMessages, deleteConsultation, unsendMessage,
  renameConsultation, sendMessage as apiSendMessage, setMessageFeedback, fetchTts,
} from '../chat/services/chatApi'
import { ageFromDob, toBubble } from '../chat/utils/format.jsx'
import { uploadFile, listUploads } from '../../services/uploads'
import { useToast } from '../../components/ui'
import { errText } from '../../utils/errText'
import { useVoiceInput } from '../chat/voice/useVoiceInput'
import { ttsPlayer } from '../chat/tts/ttsPlayer'
import { shouldAutoRead } from '../chat/tts/autoRead'

const HOSPITALS_NEAR_ME = 'https://www.google.com/maps/search/hospitals+near+me'

export function useDashboard() {
  const navigate = useNavigate()
  const toast = useToast()
  const { profile, loading, error: profileError, refresh: reloadProfile } = useProfile()
  const { signOut } = useAuth()

  const [initialLoading, setInitialLoading] = useState(true)
  const [consultations, setConsultations] = useState([])
  const [consultationsError, setConsultationsError] = useState('')
  const [activeId, setActiveId] = useState(null)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isLoading, setIsLoading] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [isEmergency, setIsEmergency] = useState(false)
  const [emergencyFromAssessment, setEmergencyFromAssessment] = useState(false)
  const [lastRiskScore, setLastRiskScore] = useState(null)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [attachments, setAttachments] = useState([])
  const [chatAttachmentMap, setChatAttachmentMap] = useState({}) // id -> {kind, filename, downloadUrl}
  const [search, setSearch] = useState('')
  const [searchResults, setSearchResults] = useState(null) // null = not searching
  const [searching, setSearching] = useState(false)
  const [renameTarget, setRenameTarget] = useState(null) // { id, title } | null
  const [lastReply, setLastReply] = useState(null) // newest reply/error from a send, for the live region

  const docInputRef = useRef(null)
  const photoInputRef = useRef(null)

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

  // Retry after a failed initial load: reload the list and open the newest chat.
  const reloadChats = async () => {
    const list = await loadConsultations()
    if (list.length && !activeId) await selectConsultation(list[0].consultationId)
  }

  const loadConsultations = useCallback(async () => {
    try {
      const list = await listConsultations()
      setConsultations(list)
      setConsultationsError('')
      return list
    } catch (e) {
      setConsultationsError(errText(e, 'Could not load your chats.'))
      return []
    }
  }, [])

  const loadChatAttachments = async (id) => {
    try {
      const list = await listUploads('chat', id)
      const map = {}
      for (const a of (Array.isArray(list) ? list : [])) map[a.attachmentId] = a
      setChatAttachmentMap(map)
    } catch { setChatAttachmentMap({}) }
  }
  const selectConsultation = async (id) => {
    setActiveId(id); setIsEmergency(false); setLastReply(null)
    try { const msgs = await getMessages(id); setMessages(msgs.map(toBubble)) } catch { setMessages([]) }
    loadChatAttachments(id)
  }

  useEffect(() => {
    ;(async () => {
      try {
        const list = await loadConsultations()
        // Wait for the first conversation's messages before revealing the chat
        // so it renders directly (no "new consultation" flash).
        if (list.length) await selectConsultation(list[0].consultationId)
      } finally {
        setInitialLoading(false)
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { fetch('/api/health').then((r) => setIsOffline(!r.ok)).catch(() => setIsOffline(true)) }, [])

  const startNewConsultation = async () => {
    try {
      const c = await createConsultation()
      setConsultations((prev) => [c, ...prev]); setActiveId(c.consultationId); setMessages([]); setIsEmergency(false)
      return c
    } catch (e) { toast.error(errText(e, 'Could not start a new chat.')); return null }
  }
  // Called after the user confirms in a dialog. Resolves true on success.
  const deleteChat = async (id) => {
    try {
      await deleteConsultation(id)
      setConsultations((prev) => prev.filter((c) => c.consultationId !== id))
      setSearchResults((prev) => (prev ? prev.filter((c) => c.consultationId !== id) : prev))
      if (activeId === id) { setActiveId(null); setMessages([]) }
      toast.success('Chat deleted.')
      return true
    } catch (e) {
      toast.error(errText(e, 'Could not delete the chat. Please try again.'))
      return false
    }
  }
  const openRename = (consult) => setRenameTarget({ id: consult.consultationId, title: consult.title || '' })
  const closeRename = () => setRenameTarget(null)
  const renameChat = async (id, rawTitle) => {
    const title = rawTitle.trim()
    if (!title) return false
    try {
      const updated = await renameConsultation(id, title)
      const newTitle = updated?.title || title
      const apply = (list) => list.map((c) => (c.consultationId === id ? { ...c, title: newTitle } : c))
      setConsultations(apply)
      setSearchResults((prev) => (prev ? apply(prev) : prev))
      return true
    } catch (err) {
      toast.error(errText(err, 'Could not rename the chat.'))
      return false
    }
  }

  // Core send. `meta` = { inputMode, lang } (voice drafts carry the detected language).
  const sendText = async (text, ready, meta = { inputMode: 'text' }) => {
    setIsLoading(true)
    const tmpId = `tmp-${Date.now()}`
    const attachmentIds = ready.map((a) => a.attachmentId)
    // Carry local previews so the just-sent bubble shows thumbnails immediately.
    const msgAttachments = ready.map((a) => ({ attachmentId: a.attachmentId, kind: a.kind, name: a.name, url: a.previewUrl || a.url || null }))
    let cid = activeId
    // Show the user's message immediately, even before a new chat exists, so
    // it never disappears if creating the chat fails.
    setMessages((prev) => [...prev, { id: tmpId, sender: 'user', text, createdAt: new Date().toISOString(), status: 'sent', attachments: msgAttachments }])
    try {
      if (!cid) { const c = await createConsultation(); setConsultations((prev) => [c, ...prev]); cid = c.consultationId; setActiveId(cid) }
      const res = await apiSendMessage(cid, text, attachmentIds, meta)
      setMessages((prev) => prev.map((m) => (m.id === tmpId ? { ...m, status: 'received' } : m)))
      if (attachmentIds.length) loadChatAttachments(cid)
      setIsOffline(Boolean(res.isOfflineFallback))
      if (res.assistantMessage) {
        const bot = toBubble(res.assistantMessage)
        if (res.isOfflineFallback) bot.offline = true
        setMessages((prev) => [...prev, bot])
        setLastReply(bot)
        if (bot.riskScore != null) setLastRiskScore(bot.riskScore)
        if (bot.severity === 'EMERGENCY') { setIsEmergency(true); setEmergencyFromAssessment(true) }
        // Opt-in: read replies to spoken messages aloud. A browser may refuse
        // autoplay; the speaker button still works, so fail quietly.
        if (shouldAutoRead(meta.inputMode)) ttsPlayer.play(bot.id, () => fetchTts(cid, bot.id)).catch(() => {})
      }
      loadConsultations()
    } catch (err) {
      // Not an AI answer: a distinct, retryable error row. The user's message
      // is marked as not sent rather than left "Sending…" forever.
      const errRow = { id: `err-${Date.now()}`, sender: 'error', text: errText(err, 'The service is unavailable right now.'), retry: { text, ready, meta, failedId: tmpId }, createdAt: new Date().toISOString() }
      setMessages((prev) => [...prev.map((m) => (m.id === tmpId ? { ...m, status: 'failed' } : m)), errRow])
      setLastReply(errRow)
    } finally { setIsLoading(false) }
  }

  const handleSend = async (e) => {
    e?.preventDefault()
    const text = input.trim()
    // Only fully-uploaded attachments can be sent with the message.
    const ready = attachments.filter((a) => a.status === 'uploaded' && a.attachmentId)
    if ((!text && ready.length === 0) || isLoading) return
    const meta = voice.state === 'review' ? { inputMode: 'voice', lang: voice.draftLang || undefined } : { inputMode: 'text' }
    setInput('')
    setAttachments([]) // they now belong to the message
    await sendText(text, ready, meta)
  }
  const retrySend = async (errId) => {
    const row = messages.find((m) => m.id === errId)
    if (!row?.retry || isLoading) return
    setMessages((prev) => prev.filter((m) => m.id !== errId && m.id !== row.retry.failedId))
    await sendText(row.retry.text, row.retry.ready, row.retry.meta)
  }
  const dismissError = (errId) => setMessages((prev) => prev.filter((m) => m.id !== errId))

  // Like/dislike an AI response. Toggling the active choice clears it.
  // Optimistic with revert on failure.
  const submitFeedback = async (messageId, feedback) => {
    if (!activeId || !messageId) return
    const current = messages.find((m) => m.id === messageId)?.feedback ?? null
    const next = current === feedback ? null : feedback
    setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback: next } : m)))
    try {
      await setMessageFeedback(activeId, messageId, next)
    } catch (err) {
      setMessages((prev) => prev.map((m) => (m.id === messageId ? { ...m, feedback: current } : m)))
      toast.error(errText(err, 'Could not save your feedback.'))
    }
  }

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
    try { await unsendMessage(activeId, messageId) } catch (e) {
      setMessages(prev)
      toast.error(errText(e, 'Could not unsend the message.'))
    }
  }

  // Leave the protected area first, then clear the session and app state.
  const handleSignOut = async () => { navigate('/', { replace: true }); await signOut() }

  // Chat attachments upload directly to the transient chat bucket (scope=chat).
  const onFilesSelected = (kind) => async (e) => {
    const picked = Array.from(e.target.files || [])
    e.target.value = ''
    if (!picked.length) return
    if (!activeId) { toast.info('Start or open a chat before attaching files.'); return }
    for (const f of picked) {
      const localId = `att-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
      const previewUrl = kind === 'photo' ? URL.createObjectURL(f) : null
      setAttachments((prev) => [...prev, { localId, name: f.name, kind, status: 'uploading', previewUrl }])
      try {
        const rec = await uploadFile(f, { scope: 'chat', kind, chatId: activeId })
        setAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, status: 'uploaded', attachmentId: rec.attachmentId } : a)))
      } catch (err) {
        setAttachments((prev) => prev.map((a) => (a.localId === localId ? { ...a, status: 'failed' } : a)))
        toast.error(errText(err, `Could not upload ${f.name}.`))
      }
    }
  }
  const removeAttachment = (localId) => setAttachments((prev) => prev.filter((a) => a.localId !== localId))

  // Amazon Transcribe voice input. The transcript lands in `input` for review;
  // the user sends it (edited or not) with the normal Send / Enter.
  const voice = useVoiceInput({ input, setInput, onError: (msg) => toast.error(msg) })

  // Opens in a NEW tab so the app (and its emergency actions) stays open. The
  // tab is opened synchronously inside the click so popup blockers allow it,
  // then pointed at the user's location once known; if location is refused or
  // unavailable it falls back to a "near me" search rather than a dead end.
  const handleFindHospitals = () => {
    const tab = window.open('about:blank', '_blank')
    const go = (url) => { if (tab) { tab.opener = null; tab.location.href = url } else window.location.href = url }
    if (!navigator.geolocation) { go(HOSPITALS_NEAR_ME); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => go(`https://www.google.com/maps/search/hospitals/@${pos.coords.latitude},${pos.coords.longitude},14z`),
      () => { go(HOSPITALS_NEAR_ME); toast.info('Location is off, so the map will search near you instead.') },
      { timeout: 8000, maximumAge: 60000 },
    )
  }
  const handleSendLocationAlert = () => {
    if (!primaryContact?.phone) return
    if (!navigator.geolocation) { toast.error('This browser cannot share your location. Call your contact instead.'); return }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const link = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`
        const body = encodeURIComponent(`Medical Emergency! My location: ${link}`)
        window.location.href = `sms:${primaryContact.phone}?body=${body}`
      },
      () => toast.error('Could not get your location. Allow location access, or call your contact instead.'),
      { timeout: 10000, maximumAge: 60000 },
    )
  }

  const goChat = () => navigate('/dashboard/chat')
  const goEditProfile = () => navigate('/profile-setup')
  // SOS: the emergency panel appears instantly — no confirmation, no delay.
  const triggerSos = () => { setEmergencyFromAssessment(false); setIsEmergency(true); goChat() }

  const refs = { docInputRef, photoInputRef }
  return {
    refs, lastReply, loading, initialLoading, profileError, reloadProfile, reloadChats, profile, fullName, firstName, age, profileCompletion, contacts, primaryContact,
    consultations, consultationsError, loadConsultations, activeId, messages, input, setInput, isLoading,
    isOffline, isEmergency, setIsEmergency, emergencyFromAssessment, lastRiskScore, analysisOpen, setAnalysisOpen,
    attachments, removeAttachment, voice, chatAttachmentMap,
    search, setSearch, searching, visibleConsultations, onFilesSelected,
    selectConsultation, startNewConsultation, deleteChat, openRename, closeRename, renameTarget, renameChat,
    handleSend, retrySend, dismissError, handleFindHospitals, handleSendLocationAlert, submitFeedback,
    handleSignOut, goEditProfile, goChat, unsendMessageById, triggerSos,
  }
}
