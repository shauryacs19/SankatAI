import { useEffect, useMemo, useRef, useState } from 'react'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Linking, Modal, Alert, Animated, PanResponder, Dimensions, Share, Image } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { ArrowRight, Ambulance, MapPin, HeartPulse, ClipboardList, Gauge, AlertTriangle, X, Phone, Activity, ThumbsUp, ThumbsDown, Paperclip, FileText, Image as ImageIcon, Trash2, ShieldCheck, Share2, Mic, CheckCheck, Siren, Lock, Languages, Navigation, RotateCw, CloudOff, Bandage, Brain, Soup, Thermometer, Wind } from 'lucide-react-native'
import { radius, sevColor } from '../../theme'
import { useTheme } from '../../context/ThemeContext'
import { useProfile } from '../../context/ProfileContext'
import { useChat } from '../../context/ChatContext'
import { createConsultation, getMessages, sendMessage as apiSend, setMessageFeedback, unsendMessage, fetchWithTimeout, translateMessage, findNearbyCare, request } from '../../lib/api'
import { kindForAsset, uploadFile, uploadTriageImage, deleteUpload, listUploads } from '../../lib/uploads'
import { API_BASE_URL } from '../../config'
import { fmtTime, MSG_SENT, MSG_RECEIVED, sevMeta, AI_DISCLAIMER, EMERGENCY_CALLOUT, CHAT_SUGGESTIONS, nextTranslation, replyLanguageOf, TRANSLATION_LABELS, TRANSLATION_NAMES } from '../../lib/chat'
import { isImageFile, openInAppBrowser } from '../../lib/preview'
import FilePreview from '../../components/FilePreview'
import { useVoiceInput } from '../../lib/useVoiceInput'
import VoiceSheet from '../../components/VoiceSheet'
import SpeakerButton from '../../components/SpeakerButton'
import { getAutoRead, loadTts, tts, ttsAvailable } from '../../lib/tts'
import { voiceFlags } from '../../../../../packages/shared/voice'
import FollowUpQuestionnaire from '../../components/FollowUpQuestionnaire'

const SCREEN_W = Dimensions.get('window').width
const GUEST_SAVE_KEY = 'sankatai:guest-chat'

const SEV_LABEL = { LOW: 'Low', MODERATE: 'Moderate', HIGH: 'High', EMERGENCY: 'Emergency' }

const parseA = (raw) => { try { return JSON.parse(raw) } catch { return null } }
const normalizeQuestionnaire = (p) => Array.isArray(p.questionnaire)
  ? p.questionnaire.filter((it) => it && typeof it.id === 'string' && typeof it.question === 'string' && Array.isArray(it.options) && (it.kind === 'text' || it.options.length))
  : []
const assessmentDetails = (p) => {
  if (!p?.triage) return null
  const strings = (value) => Array.isArray(value) ? value.filter((item) => typeof item === 'string' && item.trim()) : []
  const details = {
    seekCare: typeof p.seekCare === 'string' ? p.seekCare : '',
    homeCare: strings(p.homeCare), warningSigns: strings(p.warningSigns), likelyCauses: strings(p.likelyCauses),
    safetyNote: typeof p.safetyNote === 'string' ? p.safetyNote : '',
    confidence: typeof p.confidence === 'number' ? p.confidence : null,
  }
  return details.seekCare || details.homeCare.length || details.warningSigns.length || details.likelyCauses.length || details.safetyNote ? details : null
}
const normalize = (content) => {
  const p = parseA(content)
  if (!p) return { text: content, severity: null, riskScore: null }
  const questionnaire = normalizeQuestionnaire(p)
  const details = assessmentDetails(p)
  if (p.followUpQuestions?.length) return { text: '', questions: p.followUpQuestions, questionnaire, intro: typeof p.reasoning === 'string' ? p.reasoning : '', details, severity: null, riskScore: null }
  if (p.severity) return {
    text: p.advice || '', severity: p.severity, riskScore: typeof p.riskScore === 'number' ? Math.round(p.riskScore) : null,
    details, recommendations: Array.isArray(p.recommendations) ? p.recommendations : [],
    care: p.care && typeof p.care.specialty === 'string' ? p.care : null,
  }
  return { text: p.advice || content, severity: null, riskScore: null }
}
const toBubble = (m) => (m.role === 'user'
  // persisted by the server => double tick
  ? { id: m.id, sender: 'user', text: m.content, attachmentIds: m.attachmentIds || [], createdAt: m.createdAt, status: MSG_RECEIVED }
  : { id: m.id, sender: 'bot', ...normalize(m.content), raw: m.content, lang: m.lang || null, offline: Boolean(m.isOfflineFallback), feedback: m.feedback ?? null, createdAt: m.createdAt })

// Animated "Sending…" shown under a user message until the server persists it.
// Once delivered nothing is shown (no tick markers).
function SendingDots({ color }) {
  const dots = [useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current, useRef(new Animated.Value(0)).current]
  useEffect(() => {
    const loops = dots.map((d, i) => Animated.loop(Animated.sequence([
      Animated.delay(i * 130),
      Animated.timing(d, { toValue: 1, duration: 260, useNativeDriver: true }),
      Animated.timing(d, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.delay((2 - i) * 130),
    ])))
    loops.forEach((l) => l.start())
    return () => loops.forEach((l) => l.stop())
  }, []) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 2, marginLeft: 3 }}>
      {dots.map((d, i) => (
        <Animated.Text
          key={i}
          style={{ fontSize: 11, color, transform: [{ translateY: d.interpolate({ inputRange: [0, 1], outputRange: [0, -3] }) }] }}
        >
          .
        </Animated.Text>
      ))}
    </View>
  )
}

// Shown only in a NEW chat, between the suggestion cards and the quick-prompt
// chips: a light-grey pill with a slim red border, slowly fading in and out.
function SecureNote({ colors, styles }) {
  const a = useRef(new Animated.Value(1)).current
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(a, { toValue: 0.25, duration: 1100, useNativeDriver: true }),
      Animated.timing(a, { toValue: 1, duration: 1100, useNativeDriver: true }),
    ]))
    loop.start()
    return () => loop.stop()
  }, [a])
  return (
    <Animated.View style={[styles.secureRow, { opacity: a }]} pointerEvents="none">
      <Lock size={11} color={colors.muted} />
      <Text style={styles.secureText}>Your data is encrypted and secure</Text>
    </Animated.View>
  )
}

// Message row that fades + slides in on mount.
function AnimatedMsg({ children }) {
  const a = useRef(new Animated.Value(0)).current
  useEffect(() => { Animated.timing(a, { toValue: 1, duration: 220, useNativeDriver: true }).start() }, [a])
  return (
    <Animated.View style={{ opacity: a, transform: [{ translateY: a.interpolate({ inputRange: [0, 1], outputRange: [10, 0] }) }] }}>
      {children}
    </Animated.View>
  )
}

const STARTER_PROMPTS = [
  { title: 'Fever or infection', body: 'I have a fever and I think I may have an infection.', Icon: Thermometer },
  { title: 'Headache or dizziness', body: 'I have a headache and I feel dizzy.', Icon: Brain },
  { title: 'Cough or trouble breathing', body: 'I have a cough and some trouble breathing.', Icon: Wind },
  { title: 'Stomach pain or vomiting', body: 'I have stomach pain and I have been vomiting.', Icon: Soup },
  { title: 'Injury, cut or sprain', body: 'I have hurt myself and need help with an injury.', Icon: Bandage },
  { title: 'Chest pain or pressure', body: 'I have chest pain or pressure.', Icon: HeartPulse },
]

function WelcomeEmpty({ firstName, colors, styles, onPrompt }) {
  const fade = useRef(new Animated.Value(0)).current
  const rise = useRef(new Animated.Value(0)).current

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fade, { toValue: 1, duration: 360, useNativeDriver: true }),
      Animated.spring(rise, { toValue: 1, friction: 8, tension: 48, useNativeDriver: true }),
    ]).start()
  }, [fade, rise])

  return (
    <Animated.View style={[styles.welcome, { opacity: fade, transform: [{ translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [14, 0] }) }] }]}>
      <View style={styles.welcomeHero}>
        <View style={styles.heroMark}><HeartPulse size={22} color={colors.onPrimary} /></View>
        <Text style={styles.greetH}>Hello, {firstName}.</Text>
        <Text style={styles.heroTitle}>What would you like help with today?</Text>
        <Text style={styles.greetP}>Describe your symptoms in your own words. I’ll ask a few questions and tell you how urgent it may be. This is guidance, not a diagnosis. If someone is in danger, call 108 now.</Text>
      </View>

      <View style={styles.promptHeading}>
        <Text style={styles.promptTitle}>Quick help for</Text>
      </View>
      <View style={styles.starterList}>
        {STARTER_PROMPTS.map(({ title, body, Icon }, index) => (
          <TouchableOpacity key={title} style={[styles.starterCard, index > 0 && styles.starterCardBorder]} onPress={() => onPrompt(body)} activeOpacity={0.78}>
            <View style={styles.starterIcon}><Icon size={18} color={colors.primary} /></View>
            <Text style={styles.starterTitle}>{title}</Text>
            <ArrowRight size={17} color={colors.primary} />
          </TouchableOpacity>
        ))}
      </View>
      <View style={styles.welcomeNote}><SecureNote colors={colors} styles={styles} /></View>
    </Animated.View>
  )
}

function FeedbackFollowUp({ styles, colors, onSubmit, onClose }) {
  const [reason, setReason] = useState(null)
  const [direction, setDirection] = useState(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    if ((!reason && !comment.trim()) || busy) return
    setBusy(true)
    const ok = await onSubmit({
      ...(reason && { reason }),
      ...(reason === 'wrong_severity' && direction && { direction }),
      ...(comment.trim() && { comment: comment.trim() }),
    })
    setBusy(false)
    if (ok !== false) onClose()
  }
  const reasons = [
    ['inaccurate', 'Inaccurate'],
    ['too_generic', 'Too generic'],
    ['wrong_severity', 'Wrong severity'],
  ]
  return (
    <View style={styles.feedbackMore}>
      <Text style={styles.feedbackMoreTitle}>What was wrong? <Text style={styles.feedbackMoreOptional}>(optional)</Text></Text>
      <View style={styles.feedbackChips}>
        {reasons.map(([key, label]) => (
          <TouchableOpacity key={key} style={[styles.feedbackChip, reason === key && styles.feedbackChipSelected]} onPress={() => setReason(reason === key ? null : key)} accessibilityRole="button" accessibilityState={{ selected: reason === key }}>
            <Text style={[styles.feedbackChipText, reason === key && styles.feedbackChipTextSelected]}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>
      {reason === 'wrong_severity' && (
        <View style={styles.feedbackSeverityRow}>
          <Text style={styles.feedbackMoreOptional}>It should have been</Text>
          {['higher', 'lower'].map((value) => (
            <TouchableOpacity key={value} style={[styles.feedbackChip, direction === value && styles.feedbackChipSelected]} onPress={() => setDirection(value)} accessibilityRole="button" accessibilityState={{ selected: direction === value }}>
              <Text style={[styles.feedbackChipText, direction === value && styles.feedbackChipTextSelected]}>{value === 'higher' ? 'More serious' : 'Less serious'}</Text>
            </TouchableOpacity>
          ))}
        </View>
      )}
      <TextInput value={comment} onChangeText={(value) => setComment(value.slice(0, 280))} maxLength={280} multiline textAlignVertical="top" placeholder="Anything else? Please leave out names and phone numbers." placeholderTextColor={colors.muted} style={styles.feedbackComment} accessibilityLabel="Comment (optional)" />
      <View style={styles.feedbackMoreActions}>
        <TouchableOpacity style={[styles.feedbackSend, (!reason && !comment.trim() || busy) && styles.feedbackSendDisabled]} onPress={send} disabled={!reason && !comment.trim() || busy} accessibilityRole="button">
          {busy ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Text style={styles.feedbackSendText}>Send</Text>}
        </TouchableOpacity>
        <TouchableOpacity style={styles.feedbackSkip} onPress={onClose} disabled={busy} accessibilityRole="button"><Text style={styles.feedbackSkipText}>Skip</Text></TouchableOpacity>
      </View>
    </View>
  )
}

export default function ChatScreen({ navigation }) {
  const { profile } = useProfile()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  // Consultation list / active chat live in ChatContext (shared with the drawer).
  const { activeId, selectionSeq, registerCreated, loadList } = useChat()
  const guestImportStarted = useRef(false)
  const [messages, setMessages] = useState([])
  const [feedbackOpenId, setFeedbackOpenId] = useState(null)
  const [translationBusy, setTranslationBusy] = useState(null)
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [emergency, setEmergency] = useState(false)
  const [lastRiskScore, setLastRiskScore] = useState(null)
  const [isOffline, setIsOffline] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [nearby, setNearby] = useState(null)
  const [attachments, setAttachments] = useState([]) // [{ attachmentId, filename, kind }]
  const [attaching, setAttaching] = useState(false)
  // Amazon Transcribe voice input. The transcript lands in `input` for review;
  // the user sends it (edited or not) with the normal Send.
  const voice = useVoiceInput({ input, setInput, onError: (msg) => Alert.alert('Voice input', msg) })
  const { popupOpen, inputReadOnly } = voiceFlags(voice.state, { text: input, sending: loading })
  // Attachment-only messages are still allowed, as before.
  const sendDisabled = loading || attaching || popupOpen || (!input.trim() && attachments.length === 0)
  const inputRef = useRef(null)
  useEffect(() => { if (voice.state === 'review') inputRef.current?.focus() }, [voice.state])
  // Leaving the chat, or switching conversation, stops any reply being read.
  useEffect(() => {
    const unsubscribe = navigation?.addListener?.('blur', () => tts.stop())
    return () => { unsubscribe?.(); tts.stop() }
  }, [navigation])
  useEffect(() => () => tts.stop(), [activeId])
  const scrollRef = useRef(null)

  const firstName = profile?.firstName || 'there'
  const contacts = Array.isArray(profile?.emergencyContacts) ? profile.emergencyContacts : []
  const primary = contacts.find((c) => c.phone) || contacts[0]

  // Latest structured AI analysis (for the analysis panel).
  const latestAnalysis = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.sender === 'bot' && m.raw) {
        const p = parseA(m.raw)
        if (p && (p.severity || p.followUpQuestions?.length)) return p
      }
    }
    return null
  }, [messages])

  // id -> { filename, kind, downloadUrl } for the active chat, so history
  // messages can show real thumbnails/filenames (web parity).
  const [attachMap, setAttachMap] = useState({})
  const loadChatAttachments = async (chatId) => {
    if (!chatId) return setAttachMap({})
    try {
      const list = await listUploads('chat', chatId)
      const map = {}
      for (const a of (Array.isArray(list) ? list : [])) map[a.attachmentId] = a
      setAttachMap(map)
    } catch { /* keep whatever we have */ }
  }

  // Resolve a message's attachments: optimistic sends carry local names, history
  // messages carry ids resolved through the map above.
  const msgAttachments = (m) => {
    const ids = m.attachmentIds || []
    if (ids.length) {
      return ids.map((id, i) => {
        const a = attachMap[id]
        return {
          id,
          name: a?.filename || m.attachmentNames?.[i] || `Attachment ${i + 1}`,
          kind: a?.kind,
          url: a?.downloadUrl || null,
        }
      })
    }
    return (m.attachmentNames || []).map((name, i) => ({ id: `local-${i}`, name, kind: null, url: null }))
  }
  // Previews stay in the app: images in the FilePreview modal, other files in
  // the in-app browser (expo-web-browser) — never handed to an external app.
  const [preview, setPreview] = useState(null) // { url, name }
  const openAttachment = async (att) => {
    if (!att.url) return
    if (isImageFile({ kind: att.kind, name: att.name })) { setPreview({ url: att.url, name: att.name }); return }
    if (!(await openInAppBrowser(att.url, colors))) Alert.alert('Could not open the file.')
  }

  // Load messages for the active chat whenever the selection changes (from the
  // drawer's history list or "new chat"). selectionSeq bumps only on explicit
  // select/new, so optimistic sends into a freshly-created chat aren't wiped.
  useEffect(() => {
    let alive = true
    setEmergency(false)
    if (activeId == null) { setMessages([]); return () => { alive = false } }
    getMessages(activeId).then((msgs) => { if (alive) setMessages(msgs.map(toBubble)) }).catch(() => { if (alive) setMessages([]) })
    loadChatAttachments(activeId)
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectionSeq])

  useEffect(() => {
    fetchWithTimeout(`${API_BASE_URL}/api/health`, {}, 6000).then((r) => setIsOffline(!r.ok)).catch(() => setIsOffline(true))
  }, [])

  // A guest can opt to keep their conversation by creating an account. The
  // signed guest transcript is imported once into the new account's history.
  useEffect(() => {
    if (guestImportStarted.current) return
    guestImportStarted.current = true
    ;(async () => {
      try {
        const raw = await AsyncStorage.getItem(GUEST_SAVE_KEY)
        if (!raw) return
        const draft = JSON.parse(raw)
        if (!draft?.guestId || !Array.isArray(draft.messages) || !draft.messages.length) return
        const created = await request('/guest/save', { method: 'POST', body: draft })
        await AsyncStorage.removeItem(GUEST_SAVE_KEY)
        registerCreated(created)
        loadList()
        Alert.alert('Chat saved', 'Your guest conversation is now in your chat history.')
      } catch (e) {
        Alert.alert('Could not save the guest chat', e.message || 'Your conversation is still on this device. Try again later.')
      }
    })()
  }, [registerCreated, loadList])

  // Like/dislike an AI response. Toggling the active choice clears it.
  const submitFeedback = async (messageId, feedback) => {
    if (!activeId || !messageId) return
    const current = messages.find((m) => m.id === messageId)?.feedback ?? null
    const next = current === feedback ? null : feedback
    setMessages((p) => p.map((m) => (m.id === messageId ? { ...m, feedback: next } : m)))
    setFeedbackOpenId(next === 'dislike' ? messageId : null)
    try {
      await setMessageFeedback(activeId, messageId, next)
    } catch {
      setMessages((p) => p.map((m) => (m.id === messageId ? { ...m, feedback: current } : m)))
    }
  }

  const submitFeedbackDetail = async (messageId, extra) => {
    if (!activeId || !messageId) return false
    try {
      await setMessageFeedback(activeId, messageId, 'dislike', extra)
      return true
    } catch (error) {
      Alert.alert('Could not send feedback', error?.message || 'Please check your connection and try again.')
      return false
    }
  }

  const advanceTranslation = async (message) => {
    if (!activeId || !message?.id || translationBusy) return
    const original = replyLanguageOf(message.lang, message.raw)
    const shown = message.translationTarget || original
    const target = nextTranslation(shown)
    if (target === original) {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, translationTarget: original, translatedReply: null } : m)))
      return
    }
    const cached = message.translations?.[target]
    if (cached) {
      setMessages((prev) => prev.map((m) => (m.id === message.id ? { ...m, translationTarget: target, translatedReply: cached } : m)))
      return
    }
    setTranslationBusy(message.id)
    try {
      const res = await translateMessage(activeId, message.id, target)
      const translatedReply = normalize(res.content)
      setMessages((prev) => prev.map((m) => (m.id === message.id
        ? { ...m, translationTarget: target, translatedReply, translations: { ...(m.translations || {}), [target]: translatedReply } }
        : m)))
    } catch (e) {
      Alert.alert('Translation unavailable', e.message || 'Could not translate this reply. Try again.')
    } finally { setTranslationBusy(null) }
  }

  const ensureConsultation = async () => {
    if (activeId) return activeId
    const c = await createConsultation()
    registerCreated(c) // adds to the drawer list + sets active without a message reload
    return c.consultationId
  }

  // Upload a picked file to S3 under this chat, then hold its id until send.
  const addAttachment = async (asset) => {
    if (attaching) return
    setAttaching(true)
    try {
      if (kindForAsset(asset) === 'photo') {
        const result = await uploadTriageImage(asset, activeId || null)
        if (!activeId && result.consultationId) {
          registerCreated({ consultationId: result.consultationId, title: 'Photo assessment', updatedAt: new Date().toISOString() })
          loadList()
        }
        setAttachments((p) => [...p, {
          attachmentId: result.imageId,
          filename: asset.name || asset.fileName || `photo-${Date.now()}.jpg`,
          kind: 'photo',
          previewUrl: result.previewUrl,
        }])
      } else {
        const cid = await ensureConsultation()
        const up = await uploadFile(asset, { scope: 'chat', chatId: cid })
        setAttachments((p) => [...p, { attachmentId: up.attachmentId, filename: up.filename, kind: up.kind }])
      }
    } catch (e) {
      Alert.alert('Attachment failed', e.message || 'Please try again.')
    } finally { setAttaching(false) }
  }
  const attachPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) return Alert.alert('Photo access is needed to attach images.')
      const res = await ImagePicker.launchImageLibraryAsync({ exif: false, quality: 1 })
      const a = !res.canceled && res.assets?.[0]
      if (a) await addAttachment({ uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg', size: a.fileSize, width: a.width, height: a.height })
    } catch { Alert.alert('Could not open the photo picker.') }
  }
  const attachDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({ copyToCacheDirectory: true })
      const a = !res.canceled && res.assets?.[0]
      if (a) await addAttachment({ uri: a.uri, name: a.name, mimeType: a.mimeType || 'application/octet-stream', size: a.size })
    } catch { Alert.alert('Could not open the document picker.') }
  }
  const pickAttachment = () => {
    if (attaching || loading) return
    Alert.alert('Attach', 'Add a photo or document to this message.', [
      { text: 'Photo', onPress: attachPhoto },
      { text: 'Document', onPress: attachDocument },
      { text: 'Cancel', style: 'cancel' },
    ])
  }
  const removeAttachment = async (attachmentId) => {
    setAttachments((p) => p.filter((a) => a.attachmentId !== attachmentId))
    try { await deleteUpload(attachmentId) } catch { /* best-effort cleanup */ }
  }

  // Drag RIGHT-TO-LEFT anywhere in the thread for a springy WhatsApp-style
  // slide (visual only — the send time is already shown in each message). The responder lives on the wrapper AROUND the message list and
  // claims in the CAPTURE phase, so the ScrollView can't win the gesture first;
  // `onPanResponderTerminationRequest: false` stops it stealing mid-drag.
  const REVEAL_X = 64
  const revealX = useRef(new Animated.Value(0)).current
  const analysisOpenRef = useRef(false)   // gate: no thread gestures behind the sheet
  const springBackReveal = () => Animated.spring(revealX, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start()
  const revealPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        !analysisOpenRef.current && g.dx < -6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onMoveShouldSetPanResponder: (_, g) =>
        !analysisOpenRef.current && g.dx < -6 && Math.abs(g.dx) > Math.abs(g.dy) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => revealX.setValue(Math.max(-REVEAL_X, Math.min(0, g.dx))),
      onPanResponderRelease: springBackReveal,
      onPanResponderTerminate: springBackReveal,
    }),
  ).current

  // AI Analysis sheet: drag it down (from the grab handle / header, or anywhere
  // in the outer 20% on either side) to dismiss. Built-in PanResponder.
  const sheetY = useRef(new Animated.Value(0)).current
  useEffect(() => { analysisOpenRef.current = analysisOpen }, [analysisOpen])
  const closeAnalysis = () => {
    Animated.timing(sheetY, { toValue: 600, duration: 180, useNativeDriver: true })
      .start(() => { setAnalysisOpen(false); sheetY.setValue(0) })
  }
  // Swipe down anywhere on the sheet to dismiss. Claimed in the CAPTURE phase so
  // it beats the inner ScrollView, but only when that list is already at the top
  // (standard bottom-sheet rule) or the drag starts in the outer 20% on either
  // side — otherwise scrolling the analysis content would close the sheet.
  const SHEET_EDGE = SCREEN_W * 0.2
  const sheetAtTop = useRef(true)
  const sheetEdgePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) =>
        (sheetAtTop.current || g.x0 <= SHEET_EDGE || g.x0 >= SCREEN_W - SHEET_EDGE)
        && g.dy > 8 && Math.abs(g.dy) > Math.abs(g.dx) * 1.5,
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => sheetY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => (g.dy > 110 || g.vy > 0.8
        ? closeAnalysis()
        : Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start()),
      onPanResponderTerminate: () => Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
    }),
  ).current
  const sheetPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onMoveShouldSetPanResponder: (_, g) => g.dy > 6 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderTerminationRequest: () => false,
      onPanResponderMove: (_, g) => sheetY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_, g) => (g.dy > 110 || g.vy > 0.8
        ? closeAnalysis()
        : Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start()),
      onPanResponderTerminate: () => Animated.spring(sheetY, { toValue: 0, useNativeDriver: true, bounciness: 0 }).start(),
    }),
  ).current

  const send = async (textOverride = null, answers = null) => {
    const text = (textOverride == null ? input : textOverride).trim()
    const pending = attachments
    if ((!text && pending.length === 0) || loading) return
    // Dictated drafts carry the language Transcribe identified.
    const meta = {
      ...(voice.state === 'review' ? { inputMode: 'voice', lang: voice.draftLang || undefined } : { inputMode: 'text' }),
      ...(answers && { answers }),
    }
    setInput(''); setAttachments([]); setLoading(true)
    const attachmentIds = pending.map((a) => a.attachmentId)
    const attachmentNames = pending.map((a) => a.filename)
    const tmpId = `tmp-${Date.now()}`
    try {
      const cid = await ensureConsultation()
      setMessages((p) => [...p, { id: tmpId, sender: 'user', text, attachmentNames, createdAt: new Date().toISOString(), status: MSG_SENT }])
      const res = await apiSend(cid, text, attachmentIds, meta)
      setIsOffline(Boolean(res.isOfflineFallback))
      // Reconcile the optimistic bubble with the server-persisted user message.
      if (res.userMessage) {
        setMessages((p) => p.map((m) => (m.id === tmpId ? { ...toBubble(res.userMessage), attachmentNames } : m)))
      }
      // Attachment-only messages have no assistant reply.
      if (res.assistantMessage) {
        const bot = { ...toBubble(res.assistantMessage), offline: Boolean(res.isOfflineFallback) }
        setMessages((p) => [...p, bot])
        if (bot.riskScore != null) setLastRiskScore(bot.riskScore)
        if (bot.severity === 'EMERGENCY') setEmergency(true)
        // Opt-in: read replies to spoken messages aloud.
        if (meta.inputMode === 'voice' && ttsAvailable && await getAutoRead()) {
          tts.play(bot.id, () => loadTts(cid, bot.id)).catch(() => {})
        }
      }
      if (attachmentIds.length) loadChatAttachments(cid)
      loadList()
    } catch (e) {
      setMessages((p) => [...p, { id: `err-${Date.now()}`, sender: 'bot', text: e.message || 'Service unavailable.', createdAt: new Date().toISOString() }])
    } finally { setLoading(false) }
  }

  const findHospital = async (anchor = null) => {
    setNearby({ status: 'locating', at: new Date().toISOString() })
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') { setNearby({ status: 'error', error: 'denied' }); return }
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced })
      setNearby({ status: 'searching', position: { lat: pos.coords.latitude, lng: pos.coords.longitude }, at: new Date().toISOString() })
      const lastAssessment = anchor || [...messages].reverse().find((m) => m.sender === 'bot' && m.severity) || null
      const body = { lat: pos.coords.latitude, lng: pos.coords.longitude }
      if (lastAssessment?.care?.specialty) Object.assign(body, { specialty: lastAssessment.care.specialty, issue: lastAssessment.care.issue || undefined })
      else if (activeId) Object.assign(body, { consultationId: activeId, ...(lastAssessment?.id && !String(lastAssessment.id).startsWith('tmp-') && { messageId: lastAssessment.id }) })
      const data = await findNearbyCare(body)
      setNearby({ status: 'ready', data, position: { lat: pos.coords.latitude, lng: pos.coords.longitude }, at: new Date().toISOString() })
    } catch (e) {
      setNearby({ status: 'error', error: /location/i.test(e.message || '') ? 'unavailable' : 'service' })
    }
  }
  const nearbySearchUrl = () => {
    const term = encodeURIComponent(nearby?.data?.searchTerm || 'hospital')
    const pos = nearby?.position
    return pos
      ? `https://www.google.com/maps/search/${term}/@${pos.lat},${pos.lng},14z`
      : `https://www.google.com/maps/search/${term}+near+me`
  }
  const retryNearby = () => findHospital()
  const showDirections = (place) => Linking.openURL(`https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`)
  const findHospitalRef = useRef(findHospital)
  findHospitalRef.current = findHospital
  const shareLocation = async () => {
    if (!primary?.phone) return
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return
      const pos = await Location.getCurrentPositionAsync({})
      const link = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`
      const sep = Platform.OS === 'ios' ? '&' : '?'
      Linking.openURL(`sms:${primary.phone}${sep}body=${encodeURIComponent(`Medical Emergency! My location: ${link}`)}`)
    } catch { /* */ }
  }

  useEffect(() => {
    if (!navigation?.registerChatActions) return undefined
    navigation.registerChatActions({
      openAnalysis: () => setAnalysisOpen(true),
      findHospitals: () => findHospitalRef.current?.(),
    })
    return () => navigation.registerChatActions(null)
  }, [navigation])

  // Long-press your own message -> popup -> Unsend. The server marks the row
  // deleted (kept for the audit trail) and stops returning it.
  const [unsendTarget, setUnsendTarget] = useState(null)
  const [unsending, setUnsending] = useState(false)
  const doUnsend = async () => {
    const m = unsendTarget
    if (!m || !activeId || unsending) return
    setUnsending(true)
    const prev = messages
    setMessages((p) => p.filter((x) => x.id !== m.id))
    try { await unsendMessage(activeId, m.id) }
    catch (e) { setMessages(prev); Alert.alert('Could not unsend', e.message || 'Please try again.') }
    finally { setUnsending(false); setUnsendTarget(null) }
  }

  const shareMessage = async (m) => {
    try { await Share.share({ message: [m.severity ? sevMeta(m.severity).title : 'SankatAI', m.text].filter(Boolean).join('\n\n') }) }
    catch { /* user cancelled */ }
  }

  const empty = messages.length === 0 && !loading

  return (
    <SafeAreaView style={styles.safe} edges={navigation?.shellManaged ? [] : ['top']}>
      {/* Android resizes the window around the keyboard; iOS uses the native
          keyboard-avoiding padding behaviour. */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      {emergency && (
        <View style={styles.emerg}>
          <View style={styles.emergHead}>
            <Text style={styles.emergTitle}>⚠️ Possible emergency</Text>
            <Text style={styles.emergRisk}>Risk {lastRiskScore ?? 0}</Text>
          </View>
          <View style={styles.emergRow}>
            <TouchableOpacity style={styles.emergBtnDanger} onPress={() => Linking.openURL('tel:108')}><Ambulance size={14} color="#fff" /><Text style={styles.emergBtnDangerText}>Ambulance</Text></TouchableOpacity>
            {primary?.phone && <TouchableOpacity style={styles.emergBtn} onPress={() => Linking.openURL(`tel:${primary.phone}`)}><Phone size={13} color={colors.text} /><Text style={styles.emergBtnText}>Contact</Text></TouchableOpacity>}
            {primary?.phone && <TouchableOpacity style={styles.emergBtn} onPress={shareLocation}><MapPin size={13} color={colors.text} /><Text style={styles.emergBtnText}>Location</Text></TouchableOpacity>}
            <TouchableOpacity style={styles.emergBtn} onPress={findHospital}><MapPin size={13} color={colors.text} /><Text style={styles.emergBtnText}>Hospital</Text></TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setEmergency(false)}><Text style={styles.emergDismiss}>Dismiss</Text></TouchableOpacity>
        </View>
      )}

        <Animated.View style={{ flex: 1, transform: [{ translateX: revealX }] }} {...revealPan.panHandlers}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.chat} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {empty ? (
            <WelcomeEmpty firstName={firstName} colors={colors} styles={styles} onPrompt={(text) => send(text)} />
          ) : messages.map((m) => {
            const translated = m.translatedReply || null
            const reply = translated ? { ...m, ...translated } : m
            const originalLang = replyLanguageOf(m.lang, m.raw)
            const nextLang = nextTranslation(m.translationTarget || originalLang)
            return (
            <AnimatedMsg key={m.id}>
            <View style={[styles.msgRow, m.sender === 'user' ? styles.msgRight : styles.msgLeft]}>
              {m.sender === 'user' ? (
                <View style={[styles.msgCol, { alignItems: 'flex-end' }]}>
                  <TouchableOpacity
                    style={styles.bubbleUser}
                    activeOpacity={0.9}
                    onLongPress={() => (String(m.id).startsWith('tmp-') ? null : setUnsendTarget(m))}
                    delayLongPress={350}
                  >
                    {!!m.text && <Text style={styles.bubbleText}>{m.text}</Text>}
                    {(m.attachmentNames?.length || m.attachmentIds?.length) ? (
                      <View style={[styles.attachInBubble, !!m.text && { marginTop: 6 }]}>
                        {msgAttachments(m).map((att) => (att.kind === 'photo' && att.url ? (
                          <TouchableOpacity key={att.id} onPress={() => openAttachment(att)} activeOpacity={0.85}>
                            <Image source={{ uri: att.url }} style={styles.attachImg} resizeMode="cover" />
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity key={att.id} style={styles.attachChipMsg} onPress={() => openAttachment(att)} activeOpacity={0.8}>
                            {att.kind === 'photo' ? <ImageIcon size={14} color={colors.primary} /> : <FileText size={14} color={colors.primary} />}
                            <Text style={styles.attachChipMsgText} numberOfLines={1}>{att.name}</Text>
                          </TouchableOpacity>
                        )))}
                      </View>
                    ) : null}
                    <View style={styles.msgMetaRow}>
                      <Text style={styles.msgMetaTime}>{fmtTime(m.createdAt)}</Text>
                      {m.status === MSG_RECEIVED
                        ? <CheckCheck size={13} color={colors.primary} />
                        : <SendingDots color={colors.muted} />}
                    </View>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={[styles.msgCol, { alignItems: 'flex-start' }]}>
                  <View style={[styles.aiCard, reply.questionnaire?.length && styles.aiQuestionnaireCard, m.offline && styles.offlineCard, m.severity && { borderColor: `${sevColor(m.severity)}55` }]}>
                    <View style={styles.aiIdentity}>
                      {m.offline ? <CloudOff size={15} color={colors.warning} /> : <HeartPulse size={15} color={colors.primary} />}
                      <Text style={styles.aiIdentityText}>{m.offline ? 'Offline estimate' : 'SankatAI'}</Text>
                      {m.offline && <Text style={styles.offlineTag}>Not an AI assessment</Text>}
                    </View>
                    {m.offline && <Text style={styles.offlineNotice}>The AI assistant is unavailable, so this is an automatic keyword estimate. In an emergency, call 108.</Text>}
                    {m.severity && (
                      <View style={styles.aiCardHead}>
                        <View style={[styles.sevIcon, { backgroundColor: `${sevColor(m.severity)}1F` }]}>
                          {m.severity === 'EMERGENCY'
                            ? <Siren size={16} color={sevColor(m.severity)} />
                            : <HeartPulse size={16} color={sevColor(m.severity)} />}
                        </View>
                        <Text style={[styles.sevTitle, { color: sevColor(m.severity) }]} numberOfLines={1}>
                          {sevMeta(m.severity).title}{m.riskScore != null ? `  •  ${m.riskScore}/100` : ''}
                        </Text>
                        <View style={[styles.sevPill, { backgroundColor: `${sevColor(m.severity)}1F` }]}>
                          <Text style={[styles.sevPillText, { color: sevColor(m.severity) }]}>{sevMeta(m.severity).label}</Text>
                        </View>
                      </View>
                    )}

                    {reply.questionnaire?.length ? (
                      <View style={{ gap: 10 }}>
                        {!!reply.intro && <Text style={styles.questionnaireIntro}>{reply.intro}</Text>}
                        <FollowUpQuestionnaire items={reply.questionnaire} onSubmit={send} disabled={loading} />
                      </View>
                    ) : reply.questions?.length ? (
                      <View style={styles.questionBlock}>
                        <Text style={styles.recTitle}>To understand better, please tell me:</Text>
                        {reply.questions.map((question, i) => <Text key={`${m.id}-q${i}`} style={styles.recText}>{i + 1}. {question}</Text>)}
                      </View>
                    ) : !!reply.text && <Text style={styles.aiBody}>{reply.text}</Text>}

                    {m.severity === 'EMERGENCY' && (
                      <View style={styles.callout}>
                        <Phone size={16} color={colors.sevEmergency} />
                        <Text style={styles.calloutText}>{EMERGENCY_CALLOUT}</Text>
                      </View>
                    )}

                    {Array.isArray(reply.recommendations) && reply.recommendations.length > 0 && (
                      <View style={styles.recBlock}>
                        <Text style={[styles.recTitle, m.severity && { color: sevColor(m.severity) }]}>Recommendations</Text>
                        {reply.recommendations.map((r, i) => (
                          <View key={i} style={styles.recRow}><Text style={styles.recDot}>•</Text><Text style={styles.recText}>{r}</Text></View>
                        ))}
                      </View>
                    )}

                    {!!reply.details?.seekCare && <View style={styles.detailBlock}><Text style={styles.recTitle}>When to get care</Text><Text style={styles.recText}>{reply.details.seekCare}</Text></View>}
                    {reply.details?.homeCare?.length > 0 && m.severity !== 'HIGH' && m.severity !== 'EMERGENCY' && <View style={styles.detailBlock}><Text style={styles.recTitle}>What you can do now</Text>{reply.details.homeCare.map((item, i) => <Text key={`home-${i}`} style={styles.recText}>•  {item}</Text>)}</View>}
                    {reply.details?.warningSigns?.length > 0 && <View style={styles.detailBlock}><Text style={styles.recTitle}>Get help sooner if</Text>{reply.details.warningSigns.map((item, i) => <Text key={`warn-${i}`} style={styles.recText}>•  {item}</Text>)}</View>}
                    {reply.details?.likelyCauses?.length > 0 && <View style={styles.detailBlock}><Text style={styles.recTitle}>Possible causes</Text>{reply.details.likelyCauses.map((item, i) => <Text key={`cause-${i}`} style={styles.recText}>•  {item}</Text>)}</View>}
                    {!!reply.details?.safetyNote && <Text style={styles.followUp}>{reply.details.safetyNote} If this may be an emergency, call 108.</Text>}

                    {!!reply.followUp && <Text style={styles.followUp}>{reply.followUp}</Text>}

                    {m.severity && (
                      <View style={styles.disclaimerRow}>
                        <ShieldCheck size={13} color={colors.muted} />
                        <Text style={styles.disclaimerText}>{AI_DISCLAIMER}</Text>
                      </View>
                    )}

                    <View style={styles.cardFooter}>
                      <Text style={styles.cardTime}>{fmtTime(m.createdAt)}</Text>
                      {m.raw && (
                        <>
                          <View style={styles.feedbackActions}>
                            <TouchableOpacity style={[styles.feedbackButton, m.feedback === 'like' && styles.feedbackButtonLike]} onPress={() => submitFeedback(m.id, 'like')} hitSlop={6} accessibilityRole="button" accessibilityLabel="Helpful">
                              <ThumbsUp size={14} color={m.feedback === 'like' ? colors.success : colors.muted} fill={m.feedback === 'like' ? colors.success : 'none'} />
                              <Text style={[styles.fbText, m.feedback === 'like' && { color: colors.success }]}>Helpful</Text>
                            </TouchableOpacity>
                            <TouchableOpacity style={[styles.feedbackButton, m.feedback === 'dislike' && styles.feedbackButtonDislike]} onPress={() => submitFeedback(m.id, 'dislike')} hitSlop={6} accessibilityRole="button" accessibilityLabel="Not helpful">
                              <ThumbsDown size={14} color={m.feedback === 'dislike' ? colors.primary : colors.muted} fill={m.feedback === 'dislike' ? colors.primary : 'none'} />
                              <Text style={[styles.fbText, m.feedback === 'dislike' && { color: colors.primary }]}>Not helpful</Text>
                            </TouchableOpacity>
                          </View>
                          <View style={styles.utilityActions}>
                            <TouchableOpacity style={styles.utilityButton} onPress={() => advanceTranslation(m)} disabled={translationBusy === m.id} hitSlop={6} accessibilityRole="button" accessibilityLabel={`Translate to ${TRANSLATION_NAMES[nextLang] || 'another language'}`}>
                              {translationBusy === m.id ? <ActivityIndicator size="small" color={colors.primary} /> : <Languages size={15} color={colors.muted} />}
                              <Text style={styles.utilityText}>{TRANSLATION_LABELS[nextLang] || 'Translate'}</Text>
                            </TouchableOpacity>
                            <SpeakerButton consultationId={activeId} messageId={m.id} variant={m.translationTarget === originalLang ? undefined : m.translationTarget} color={colors.muted} activeColor={colors.primary} style={styles.utilityIconButton} />
                            <TouchableOpacity style={styles.utilityIconButton} onPress={() => shareMessage(m)} hitSlop={6} accessibilityRole="button" accessibilityLabel="Share response">
                              <Share2 size={15} color={colors.muted} />
                            </TouchableOpacity>
                          </View>
                        </>
                      )}
                    </View>
                    {feedbackOpenId === m.id && m.feedback === 'dislike' && (
                      <FeedbackFollowUp
                        styles={styles}
                        colors={colors}
                        onSubmit={(extra) => submitFeedbackDetail(m.id, extra)}
                        onClose={() => setFeedbackOpenId(null)}
                      />
                    )}
                  </View>
                </View>
              )}
            </View>
            </AnimatedMsg>
            )
          })}
          {nearby && (
            <View style={styles.nearbyCard}>
              <View style={styles.nearbyHead}>
                <View style={styles.nearbyTitleRow}><MapPin size={16} color={colors.primary} /><Text style={styles.nearbyTitle}>Nearby care</Text></View>
                {nearby.status === 'ready' && <TouchableOpacity onPress={() => setNearby(null)} hitSlop={8}><X size={17} color={colors.muted} /></TouchableOpacity>}
              </View>
              {(nearby.status === 'locating' || nearby.status === 'searching') && (
                <View style={styles.nearbyBusy}><ActivityIndicator color={colors.primary} /><Text style={styles.nearbyBody}>{nearby.status === 'locating' ? 'Finding your location…' : 'Finding hospitals and clinics nearby…'}</Text></View>
              )}
              {nearby.status === 'error' && (
                <View style={{ gap: 10 }}>
                  <Text style={styles.nearbyBody}>{nearby.error === 'denied' ? 'Location access is off. Allow location to see nearby places, or search on Google Maps.' : nearby.error === 'unavailable' ? 'Could not get your location just now. Try again or search on Google Maps.' : 'Nearby care is unavailable right now. Try again or search on Google Maps.'}</Text>
                  <View style={styles.nearbyActions}>
                    {nearby.error !== 'unsupported' && <TouchableOpacity style={styles.nearbySecondary} onPress={retryNearby}><RotateCw size={14} color={colors.primary} /><Text style={styles.nearbyActionText}>Try again</Text></TouchableOpacity>}
                    <TouchableOpacity style={styles.nearbySecondary} onPress={() => Linking.openURL(nearbySearchUrl())}><MapPin size={14} color={colors.primary} /><Text style={styles.nearbyActionText}>Google Maps</Text></TouchableOpacity>
                  </View>
                </View>
              )}
              {nearby.status === 'ready' && nearby.data && (
                <>
                  {nearby.data.severity === 'EMERGENCY' && <View style={styles.nearbyEmergency}><Ambulance size={15} color={colors.sevEmergency} /><Text style={styles.nearbyEmergencyText}>In an emergency, call 108 first.</Text><TouchableOpacity onPress={() => Linking.openURL('tel:108')}><Text style={styles.nearbyCall}>Call 108</Text></TouchableOpacity></View>}
                  {nearby.data.places?.length ? nearby.data.places.slice(0, 3).map((place, i) => (
                    <View key={place.id || `${place.name}-${i}`} style={styles.nearbyPlace}>
                      <View style={styles.nearbyNumber}><Text style={styles.nearbyNumberText}>{i + 1}</Text></View>
                      <View style={{ flex: 1, gap: 3 }}>
                        <Text style={styles.nearbyPlaceName}>{place.name}</Text>
                        <Text style={styles.nearbyBody}>{place.distanceKm < 1 ? `${Math.max(10, Math.round(place.distanceKm * 100) * 10)} m` : `${place.distanceKm < 10 ? place.distanceKm.toFixed(1) : Math.round(place.distanceKm)} km`} away · {({ hospital: 'Hospital', clinic: 'Clinic', doctor: 'Doctor', dentist: 'Dental clinic' })[place.kind] || 'Clinic'}</Text>
                        {!!place.address && <Text style={styles.nearbyBody} numberOfLines={2}>{place.address}</Text>}
                        <View style={styles.nearbyActions}>
                          <TouchableOpacity onPress={() => showDirections(place)} style={styles.nearbyLink}><Navigation size={13} color={colors.primary} /><Text style={styles.nearbyActionText}>Directions</Text></TouchableOpacity>
                          {!!place.phone && <TouchableOpacity onPress={() => Linking.openURL(`tel:${String(place.phone).replace(/[^\d+]/g, '')}`)} style={styles.nearbyLink}><Phone size={13} color={colors.primary} /><Text style={styles.nearbyActionText}>Call</Text></TouchableOpacity>}
                        </View>
                      </View>
                    </View>
                  )) : <Text style={styles.nearbyBody}>No hospitals or clinics were found within {nearby.data.radiusKm} km. Try Google Maps below.</Text>}
                  <TouchableOpacity style={styles.nearbySecondary} onPress={() => Linking.openURL(nearbySearchUrl())}><MapPin size={14} color={colors.primary} /><Text style={styles.nearbyActionText}>Open in Google Maps</Text></TouchableOpacity>
                  <Text style={styles.nearbyFoot}>Straight-line distances. Your location is used for this search and is not saved.</Text>
                </>
              )}
            </View>
          )}
          {loading && <View style={[styles.msgRow, styles.msgLeft]}><View style={styles.bubbleBot}><ActivityIndicator color={colors.primary} /></View></View>}
        </ScrollView>
        </Animated.View>

        {attachments.length > 0 && (
          <View style={styles.pendingBar}>
            {attachments.map((a) => (
              <View key={a.attachmentId} style={styles.pendingChip}>
                {a.kind === 'photo' ? <ImageIcon size={12} color={colors.primary} /> : <FileText size={12} color={colors.primary} />}
                <Text style={styles.pendingChipText} numberOfLines={1}>{a.filename}</Text>
                <TouchableOpacity onPress={() => removeAttachment(a.attachmentId)} hitSlop={8}><X size={12} color={colors.muted} /></TouchableOpacity>
              </View>
            ))}
          </View>
        )}
        {/* quick actions */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={styles.chipsScroll}
          contentContainerStyle={styles.chipsRow}
          keyboardShouldPersistTaps="handled"
        >
          {CHAT_SUGGESTIONS.map((c) => (
            <TouchableOpacity
              key={c.key}
              style={styles.chip}
              onPress={() => (c.action === 'hospital' ? findHospital() : setInput(c.prompt))}
            >
              {c.action === 'hospital' ? <MapPin size={13} color={colors.textSecondary} /> : <ClipboardList size={13} color={colors.textSecondary} />}
              <Text style={styles.chipText}>{c.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {/* sits over the home/nav bar by design (immersive shell) — no bottom inset */}
        <View style={styles.inputBar}>
          <TouchableOpacity style={styles.attachBtn} onPress={pickAttachment} disabled={attaching || loading} hitSlop={8}>
            {attaching ? <ActivityIndicator color={colors.primary} size="small" /> : <Paperclip size={20} color={colors.muted} />}
          </TouchableOpacity>
          <TextInput
            ref={inputRef}
            style={styles.input}
            value={input}
            onChangeText={setInput}
            editable={!inputReadOnly}
            placeholder="Describe your symptoms…"
            placeholderTextColor={colors.muted}
            multiline
            numberOfLines={1}
            textAlignVertical="top"
            returnKeyType="default"
          />
          <TouchableOpacity
            style={styles.micBtn}
            hitSlop={6}
            onPress={voice.open}
            disabled={popupOpen}
            accessibilityRole="button"
            accessibilityLabel={voice.state === 'review' ? 'Record more' : 'Voice input'}
          >
            <Mic size={17} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.sendBtn, sendDisabled && { opacity: 0.5 }]} onPress={send} disabled={sendDisabled} accessibilityLabel="Send">
            <ArrowRight size={20} color={colors.onPrimary} />
          </TouchableOpacity>
        </View>
        {/* The dock owns the system safe-area inset, so keep only a small,
            balanced gap between the composer and dock. */}
        <View style={[styles.composerFoot, { height: 8 }]} />
      </KeyboardAvoidingView>

      {/* In-app image preview for chat attachments */}
      <FilePreview file={preview} onClose={() => setPreview(null)} />

      {/* Listening sheet (voice input) */}
      <VoiceSheet voice={voice} />

      {/* Unsend popup (long-press on your own message) */}
      <Modal visible={!!unsendTarget} animationType="fade" transparent onRequestClose={() => setUnsendTarget(null)}>
        <View style={styles.modalCenter}>
          <View style={styles.unsendCard}>
            <Text style={styles.unsendTitle}>Unsend message?</Text>
            <Text numberOfLines={3} style={styles.unsendPreview}>{unsendTarget?.text || 'Attachment'}</Text>
            <Text style={styles.unsendNote}>It will be removed from this conversation.</Text>
            <View style={styles.unsendActions}>
              <TouchableOpacity style={styles.unsendCancel} onPress={() => setUnsendTarget(null)} disabled={unsending}>
                <Text style={styles.unsendCancelText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.unsendConfirm, unsending && { opacity: 0.6 }]} onPress={doUnsend} disabled={unsending}>
                {unsending ? <ActivityIndicator color="#fff" /> : <><Trash2 size={15} color="#fff" /><Text style={styles.unsendConfirmText}>Unsend</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* AI Analysis panel */}
      <Modal visible={analysisOpen} animationType="slide" transparent onRequestClose={closeAnalysis} onShow={() => { sheetAtTop.current = true }}>
        <View style={styles.modalScrim} {...sheetEdgePan.panHandlers}>
          <Animated.View style={[styles.modalSheet, { transform: [{ translateY: sheetY }] }]}>
            {/* grab area — swipe down anywhere here to close */}
            <View {...sheetPan.panHandlers}>
              <View style={styles.grabber} />
              <View style={styles.modalHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ClipboardList size={16} color={colors.primary} /><Text style={styles.modalTitle}>AI Analysis</Text></View>
                <TouchableOpacity onPress={closeAnalysis}><X size={18} color={colors.muted} /></TouchableOpacity>
              </View>
            </View>
            {latestAnalysis && latestAnalysis.severity ? (
              <ScrollView
                contentContainerStyle={{ gap: 12, padding: 16 }}
                scrollEventThrottle={16}
                onScroll={(e) => { sheetAtTop.current = e.nativeEvent.contentOffset.y <= 2 }}
              >
                <View style={[styles.aCard, { borderColor: sevColor(latestAnalysis.severity) }]}>
                  <View style={styles.aTop}>
                    <View style={[styles.pill, { backgroundColor: `${sevColor(latestAnalysis.severity)}22` }]}>
                      <Text style={[styles.pillText, { color: sevColor(latestAnalysis.severity) }]}>{SEV_LABEL[latestAnalysis.severity] || latestAnalysis.severity}</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}><Gauge size={14} color={colors.text} /><Text style={styles.risk}>{latestAnalysis.riskScore ?? '—'}<Text style={styles.riskSmall}>/100</Text></Text></View>
                  </View>
                  <View style={styles.riskbar}><View style={[styles.riskbarFill, { width: `${Math.min(100, Math.max(0, latestAnalysis.riskScore || 0))}%`, backgroundColor: sevColor(latestAnalysis.severity) }]} /></View>
                </View>
                {!!latestAnalysis.advice && <View style={styles.aCard}><View style={styles.aHead}><HeartPulse size={14} color={colors.primary} /><Text style={styles.aHeadText}>Recommendation</Text></View><Text style={styles.aBody}>{latestAnalysis.advice}</Text></View>}
                {!!latestAnalysis.reasoning && <View style={styles.aCard}><View style={styles.aHead}><ClipboardList size={14} color={colors.primary} /><Text style={styles.aHeadText}>Clinical reasoning</Text></View><Text style={[styles.aBody, { color: colors.muted }]}>{latestAnalysis.reasoning}</Text></View>}
                <View style={styles.aCard}>
                  <View style={styles.aHead}><Activity size={14} color={colors.primary} /><Text style={styles.aHeadText}>Quick actions</Text></View>
                  <TouchableOpacity style={[styles.action, styles.actionDanger]} onPress={() => Linking.openURL('tel:108')}><Ambulance size={15} color="#fff" /><Text style={[styles.actionText, { color: '#fff' }]}>Ambulance</Text></TouchableOpacity>
                  {!!primary?.phone && <TouchableOpacity style={styles.action} onPress={shareLocation}><MapPin size={15} color={colors.text} /><Text style={styles.actionText}>Share location</Text></TouchableOpacity>}
                  <TouchableOpacity style={styles.action} onPress={findHospital}><MapPin size={15} color={colors.text} /><Text style={styles.actionText}>Find hospital</Text></TouchableOpacity>
                </View>
                {!!latestAnalysis.disclaimer && <Text style={styles.disclaimer}>{latestAnalysis.disclaimer}</Text>}
              </ScrollView>
            ) : (
              <View style={styles.aEmpty}><Activity size={30} color={colors.muted} /><Text style={styles.aEmptyText}>AI analysis will appear here once you describe your symptoms.</Text></View>
            )}
          </Animated.View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  topBar: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 },
  brandCol: { flex: 1, marginLeft: 2 },
  brand: { fontSize: 17, fontWeight: '800', color: colors.primary, letterSpacing: -0.2 },
  brandSubRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  brandSub: { fontSize: 11, color: colors.muted },
  emergencyBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft, borderRadius: 999, paddingVertical: 7, paddingHorizontal: 12 },
  emergencyBtnText: { color: colors.sevEmergency, fontWeight: '700', fontSize: 12.5 },
  offline: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.primarySoft, borderRadius: 8, paddingVertical: 3, paddingHorizontal: 7 },
  offlineText: { fontSize: 11, fontWeight: '600', color: colors.primary },
  topBtn: { padding: 6, borderRadius: 8 },
  msgCol: { maxWidth: '80%' },
  fbRow: { flexDirection: 'row', gap: 14, marginTop: 5, marginLeft: 4 },
  // sits off-screen to the left until the thread is dragged right
  tickRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 4, marginTop: 3, marginRight: 2 },
  tickText: { fontSize: 11, color: colors.muted },
  fbBtn: { padding: 2 },
  emerg: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1, margin: 12, borderRadius: radius.md, padding: 12 },
  emergHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  emergTitle: { color: colors.primary, fontWeight: '700' },
  emergRisk: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  emergRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  emergBtnDanger: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.sevEmergency, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12 },
  emergBtnDangerText: { color: '#fff', fontWeight: '700', fontSize: 13 },
  emergBtn: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.sm, paddingVertical: 8, paddingHorizontal: 12 },
  emergBtnText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  emergDismiss: { color: colors.muted, fontSize: 12, textDecorationLine: 'underline', marginTop: 8 },
  chat: { padding: 16, gap: 12, flexGrow: 1 },
  welcome: { paddingTop: 8, paddingBottom: 12 },
  welcomeHero: { marginBottom: 18 },
  heroMark: { width: 48, height: 48, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 15 },
  greetH: { fontSize: 17, fontWeight: '600', color: colors.textSecondary, marginBottom: 4 },
  heroTitle: { fontSize: 26, fontWeight: '800', color: colors.text, lineHeight: 32, letterSpacing: -0.5 },
  greetP: { color: colors.textSecondary, marginTop: 10, fontSize: 14, lineHeight: 21 },
  promptHeading: { marginBottom: 9 },
  promptTitle: { fontSize: 14, fontWeight: '700', color: colors.textSecondary },
  starterList: { overflow: 'hidden', borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, backgroundColor: colors.surface },
  starterCard: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 14, paddingVertical: 8 },
  starterCardBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  starterIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  starterTitle: { flex: 1, fontSize: 14, color: colors.text, fontWeight: '600' },
  welcomeNote: { alignItems: 'center', marginTop: 15 },
  msgRow: { flexDirection: 'row' },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  // User keeps a tinted bubble; the assistant renders as plain text on the page
  // background (ChatGPT/Claude style) — no card, border or radius.
  bubbleUser: { maxWidth: '100%', backgroundColor: colors.userBubble || colors.surface2, borderRadius: 16, borderBottomRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleBot: { maxWidth: '100%', paddingVertical: 2, paddingHorizontal: 0 },
  // --- AI response card ---
  aiCard: { width: '100%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  // Follow-up choices have their own panel. Keep the assistant wrapper invisible
  // so the choices sit directly on the chat surface without a second frame.
  aiQuestionnaireCard: { backgroundColor: 'transparent', borderWidth: 0, borderColor: 'transparent', borderRadius: 0, padding: 0, shadowColor: 'transparent', elevation: 0 },
  offlineCard: { borderStyle: 'dashed', borderColor: colors.warningBorder, backgroundColor: colors.surface },
  aiIdentity: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  aiIdentityText: { color: colors.textSecondary, fontSize: 13, fontWeight: '700' },
  offlineTag: { marginLeft: 'auto', color: colors.warning, fontSize: 11, fontWeight: '700' },
  offlineNotice: { color: colors.textSecondary, backgroundColor: colors.warningSoft, borderColor: colors.warningBorder, borderWidth: 1, borderRadius: 10, padding: 10, fontSize: 12.5, lineHeight: 18 },
  aiCardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sevIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sevTitle: { flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  sevPill: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  sevPillText: { fontSize: 11, fontWeight: '700' },
  aiBody: { fontSize: 14.5, lineHeight: 21, color: colors.text },
  questionnaireIntro: { alignSelf: 'flex-start', maxWidth: '100%', backgroundColor: colors.surface, borderRadius: 9, paddingHorizontal: 10, paddingVertical: 8, color: colors.text, fontSize: 14, lineHeight: 20, overflow: 'hidden' },
  callout: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: 12, padding: 12 },
  calloutText: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.sevEmergency, lineHeight: 19 },
  recBlock: { gap: 4 },
  detailBlock: { gap: 5, paddingTop: 2 },
  questionBlock: { gap: 6, backgroundColor: colors.surface2, borderRadius: 12, padding: 12 },
  nearbyCard: { width: '100%', backgroundColor: colors.surface, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: 16, padding: 14, gap: 12 },
  nearbyHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  nearbyTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  nearbyTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  nearbyBusy: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 7 },
  nearbyBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  nearbyPlace: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, paddingVertical: 10, borderTopWidth: 1, borderTopColor: colors.border },
  nearbyNumber: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  nearbyNumberText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  nearbyPlaceName: { color: colors.text, fontSize: 14, fontWeight: '700' },
  nearbyActions: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  nearbyLink: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 5 },
  nearbySecondary: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 38, paddingHorizontal: 11, borderWidth: 1, borderColor: colors.primaryBorder, borderRadius: 10, backgroundColor: colors.primarySoft },
  nearbyActionText: { color: colors.primary, fontSize: 12.5, fontWeight: '700' },
  nearbyEmergency: { flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, backgroundColor: colors.dangerSoft, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: 10, padding: 10 },
  nearbyEmergencyText: { flex: 1, color: colors.danger, fontSize: 12.5, fontWeight: '600' },
  nearbyCall: { color: colors.danger, fontWeight: '800', fontSize: 12.5, textDecorationLine: 'underline' },
  nearbyFoot: { color: colors.muted, fontSize: 11.5, lineHeight: 16 },
  recTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 2 },
  recRow: { flexDirection: 'row', gap: 8, paddingLeft: 2 },
  recDot: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  recText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: colors.textSecondary },
  followUp: { fontSize: 13, color: colors.muted, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 },
  disclaimerRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  disclaimerText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: colors.muted },
  cardFooter: { flexDirection: 'column', alignItems: 'stretch', gap: 6, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 9, minWidth: 0 },
  cardTime: { fontSize: 11, color: colors.muted },
  feedbackActions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 16, rowGap: 2 },
  feedbackButton: { minHeight: 32, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 3, paddingVertical: 4 },
  feedbackButtonLike: { backgroundColor: colors.successSoft, borderRadius: 8, paddingHorizontal: 8 },
  feedbackButtonDislike: { backgroundColor: colors.primarySoft, borderRadius: 8, paddingHorizontal: 8 },
  utilityActions: { width: '100%', flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 8, rowGap: 4 },
  utilityButton: { minHeight: 32, maxWidth: '100%', flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.surface },
  utilityIconButton: { minWidth: 34, minHeight: 32, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.surface },
  utilityText: { color: colors.textSecondary, fontSize: 11.5, fontWeight: '600', flexShrink: 1 },
  fbBtn2: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fbText: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  feedbackMore: { width: '100%', backgroundColor: colors.surface2, borderRadius: 12, padding: 12, gap: 10 },
  feedbackMoreTitle: { color: colors.text, fontSize: 13, fontWeight: '700' },
  feedbackMoreOptional: { color: colors.muted, fontSize: 12, fontWeight: '400' },
  feedbackChips: { flexDirection: 'row', flexWrap: 'wrap', gap: 7 },
  feedbackSeverityRow: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 7 },
  feedbackChip: { minHeight: 32, justifyContent: 'center', borderWidth: 1, borderColor: colors.border, borderRadius: 999, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 6 },
  feedbackChipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  feedbackChipText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  feedbackChipTextSelected: { color: colors.primary, fontWeight: '700' },
  feedbackComment: { minHeight: 64, maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, paddingHorizontal: 11, paddingVertical: 9, color: colors.text, fontSize: 13.5, lineHeight: 19, textAlignVertical: 'top' },
  feedbackMoreActions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 8 },
  feedbackSend: { minWidth: 66, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9, backgroundColor: colors.primary, paddingHorizontal: 13 },
  feedbackSendDisabled: { opacity: 0.5 },
  feedbackSendText: { color: colors.onPrimary, fontSize: 12.5, fontWeight: '700' },
  feedbackSkip: { minWidth: 54, minHeight: 36, alignItems: 'center', justifyContent: 'center', borderRadius: 9, paddingHorizontal: 10 },
  feedbackSkipText: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '600' },
  msgMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 5 },
  msgMetaTime: { fontSize: 10.5, color: colors.muted },
  // --- composer extras ---
  // pinned height — otherwise the horizontal list stretches down the column
  chipsScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 40 },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 12 },
  chipText: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600', lineHeight: 16 },
  micBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 999, backgroundColor: colors.surface2 },
  secureText: { fontSize: 11, color: colors.muted },
  // Blank breathing room below the composer; height is set inline from the
  // keyboard state + bottom safe-area inset. Android uses
  // softwareKeyboardLayoutMode "resize" (app.json) so the gap survives when the
  // keyboard is up.
  composerFoot: { backgroundColor: colors.surface },
  bubbleText: { fontSize: 14, color: colors.text, lineHeight: 20 },
  pill: { alignSelf: 'flex-start', borderRadius: 99, paddingVertical: 3, paddingHorizontal: 9, marginBottom: 6 },
  pillText: { fontSize: 11, fontWeight: '700' },
  attachInBubble: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  attachImg: { width: 150, height: 150, borderRadius: 12, backgroundColor: colors.surface2 },
  attachChipMsg: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 200, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 10, paddingVertical: 7, paddingHorizontal: 10 },
  attachChipMsgText: { color: colors.textSecondary, fontSize: 12, flexShrink: 1 },
  pendingBar: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, paddingHorizontal: 10, paddingTop: 8, backgroundColor: colors.surface },
  pendingChip: { flexDirection: 'row', alignItems: 'center', gap: 6, maxWidth: 200, backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: 99, paddingVertical: 6, paddingHorizontal: 10 },
  pendingChipText: { color: colors.textSecondary, fontSize: 12, flexShrink: 1 },
  attachBtn: { width: 40, height: 40, alignItems: 'center', justifyContent: 'center' },
  inputBar: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 10, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 1 },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, lineHeight: 20, color: colors.text, backgroundColor: colors.bg, textAlignVertical: 'top' },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  modalCenter: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 28 },
  unsendCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
  unsendTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  unsendPreview: { marginTop: 10, fontSize: 13.5, lineHeight: 19, color: colors.textSecondary, backgroundColor: colors.surface2, borderRadius: radius.md, padding: 10 },
  unsendNote: { marginTop: 10, fontSize: 12, color: colors.muted },
  unsendActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  unsendCancel: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface2 },
  unsendCancelText: { color: colors.textSecondary, fontWeight: '700' },
  unsendConfirm: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.sevEmergency },
  unsendConfirmText: { color: '#fff', fontWeight: '700' },
  modalScrim: { flex: 1, backgroundColor: colors.scrim, justifyContent: 'flex-end' },
  modalSheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '85%' },
  grabber: { alignSelf: 'center', width: 38, height: 4, borderRadius: 99, backgroundColor: colors.border, marginTop: 8 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 16, borderBottomColor: colors.border, borderBottomWidth: 1 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  aCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 14 },
  aTop: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  risk: { fontSize: 17, fontWeight: '800', color: colors.text },
  riskSmall: { fontSize: 11, color: colors.muted, fontWeight: '500' },
  riskbar: { height: 8, backgroundColor: colors.surface2, borderRadius: 99, overflow: 'hidden' },
  riskbarFill: { height: '100%', borderRadius: 99 },
  aHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 9 },
  aHeadText: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  aBody: { fontSize: 14, color: colors.text, lineHeight: 21 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 11, paddingHorizontal: 14, marginTop: 8, backgroundColor: colors.surface },
  actionDanger: { backgroundColor: colors.sevEmergency, borderColor: colors.sevEmergency },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.text },
  disclaimer: { fontSize: 11, color: colors.muted, textAlign: 'center', paddingVertical: 4 },
  aEmpty: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  aEmptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', maxWidth: 240 },
})
