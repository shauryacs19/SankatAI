import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard, Linking, Modal, Alert, Animated, PanResponder, Dimensions, Share, Image } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { ArrowRight, Ambulance, MapPin, HeartPulse, ClipboardList, Gauge, AlertTriangle, X, Phone, Activity, ThumbsUp, ThumbsDown, Menu, Paperclip, FileText, Image as ImageIcon, Trash2, Bell, ShieldCheck, Share2, Mic, CheckCheck, Siren, Lock, Languages, CloudOff, RotateCw, Hospital } from 'lucide-react-native'
import { radius, sevColor } from '../../theme'
import { useTheme } from '../../context/ThemeContext'
import { useProfile } from '../../context/ProfileContext'
import { useChat } from '../../context/ChatContext'
import { createConsultation, getMessages, sendMessage as apiSend, setMessageFeedback, unsendMessage, fetchWithTimeout, translateMessage } from '../../lib/api'
import { uploadFile, deleteUpload, listUploads } from '../../lib/uploads'
import { API_BASE_URL } from '../../config'
import { fmtTime, MSG_SENT, MSG_RECEIVED, sevMeta, AI_DISCLAIMER, EMERGENCY_CALLOUT, CHAT_SUGGESTIONS, TRANSLATION_LABELS, TRANSLATION_NAMES, nextTranslation, replyLanguageOf } from '../../lib/chat'
import { errText } from '../../lib/errText'
import { useToast } from '../../components/Toast'
import { isImageFile, openInAppBrowser } from '../../lib/preview'
import FilePreview from '../../components/FilePreview'
import { useVoiceInput } from '../../lib/useVoiceInput'
import VoiceSheet from '../../components/VoiceSheet'
import SpeakerButton from '../../components/SpeakerButton'
import { getAutoRead, loadTts, tts, ttsAvailable } from '../../lib/tts'
import { voiceFlags } from '../../../../../packages/shared/voice'

const SCREEN_W = Dimensions.get('window').width

const SEV_LABEL = { LOW: 'Low', MODERATE: 'Moderate', HIGH: 'High', EMERGENCY: 'Emergency' }

const parseA = (raw) => { try { return JSON.parse(raw) } catch { return null } }
const normalize = (content) => {
  const p = parseA(content)
  if (!p) return { text: content, severity: null, riskScore: null }
  if (p.followUpQuestions?.length) return { text: p.followUpQuestions.join(' '), severity: null, riskScore: null }
  if (p.severity) return { text: p.advice || '', severity: p.severity, riskScore: typeof p.riskScore === 'number' ? Math.round(p.riskScore) : null }
  return { text: p.advice || content, severity: null, riskScore: null }
}
const toBubble = (m) => (m.role === 'user'
  // persisted by the server => double tick
  ? { id: m.id, sender: 'user', text: m.content, attachmentIds: m.attachmentIds || [], createdAt: m.createdAt, status: MSG_RECEIVED }
  : { id: m.id, sender: 'bot', ...normalize(m.content), raw: m.content, lang: m.lang || null, feedback: m.feedback ?? null, createdAt: m.createdAt, offline: Boolean(m.isOfflineFallback) })
const MSG_FAILED = 'failed'
const HOSPITALS_NEAR_ME = 'https://www.google.com/maps/search/hospitals+near+me'

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

// Each tap shows the reply in the next language of the cycle
// English -> Hindi -> Hinglish -> English, starting from the reply's own (web
// parity). Translations are fetched once (cached server-side); severity never changes.
function useTranslationCycle(m, consultationId, toast) {
  const original = replyLanguageOf(m.lang, m.raw)
  const [shown, setShown] = useState(original)
  const [busy, setBusy] = useState(false)
  const texts = useRef({ [original]: m.text })
  const next = nextTranslation(shown)
  const advance = async () => {
    if (busy || !consultationId) return
    if (texts.current[next] === undefined) {
      setBusy(true)
      try {
        const res = await translateMessage(consultationId, m.id, next)
        texts.current[next] = normalize(res.content).text
      } catch (e) {
        toast.error(errText(e, 'Couldn’t translate this reply. Try again.'))
        return
      } finally {
        setBusy(false)
      }
    }
    setShown(next)
  }
  const translated = shown !== original
  return { text: translated ? texts.current[shown] : m.text, shown, next, busy, advance, translated }
}

// AI reply card. An OFFLINE keyword estimate looks visibly different (dashed,
// warning, no AI mark) so it can never pass for an AI assessment.
function BotMessage({ m, styles, colors, sev, consultationId, onFeedback, onShare, toast }) {
  const tr = useTranslationCycle(m, consultationId, toast)
  const offline = Boolean(m.offline)
  const s = m.severity ? sev[m.severity] : null
  const ink = s?.ink || colors.text
  const canAct = Boolean(m.raw) && !String(m.id).startsWith('tmp-')
  return (
    <View style={[styles.aiCard, offline && styles.aiCardOffline, s && !offline && { borderColor: s.border }]}
      accessibilityLabel={offline ? 'Offline estimate — not an AI assessment' : 'SankatAI assessment'}>
      <View style={styles.aiWho}>
        <View style={[styles.aiMark, offline && { backgroundColor: colors.surface2 }]}>
          {offline ? <CloudOff size={14} color={colors.muted} /> : <HeartPulse size={14} color={colors.primary} />}
        </View>
        <Text style={styles.aiName}>{offline ? 'Offline estimate' : 'SankatAI'}</Text>
        <Text style={styles.cardTime}>{fmtTime(m.createdAt)}</Text>
      </View>
      {m.severity && (
        <View style={styles.aiCardHead}>
          <View style={[styles.sevIcon, { backgroundColor: s?.soft }]}>
            {m.severity === 'EMERGENCY' ? <Siren size={16} color={ink} /> : <HeartPulse size={16} color={ink} />}
          </View>
          <Text style={[styles.sevTitle, { color: ink }]} numberOfLines={1}>
            {sevMeta(m.severity).title}{m.riskScore != null ? `  •  ${m.riskScore}/100` : ''}
          </Text>
          <View style={[styles.sevPill, { backgroundColor: s?.soft, borderColor: s?.border }]}>
            <Text style={[styles.sevPillText, { color: ink }]}>{sevMeta(m.severity).label}</Text>
          </View>
        </View>
      )}

      {offline && (
        <View style={styles.offlineAlert}>
          <AlertTriangle size={14} color={colors.warning} />
          <Text style={styles.offlineAlertText}>
            <Text style={{ fontWeight: '700' }}>Offline mode — this is not an AI assessment. </Text>
            The AI assistant is unavailable, so this is an automatic keyword estimate. If this could be an emergency,{' '}
            <Text style={styles.link} onPress={() => Linking.openURL('tel:108')}>call 108</Text>.
          </Text>
        </View>
      )}

      {!!tr.text && <Text style={styles.aiBody}>{tr.text}</Text>}
      {tr.translated && <Text style={styles.translated}>Translated to {TRANSLATION_NAMES[tr.shown]}</Text>}

      {m.severity === 'EMERGENCY' && (
        <View style={styles.callout}>
          <Text style={styles.calloutText}>{EMERGENCY_CALLOUT}</Text>
          <TouchableOpacity style={styles.calloutBtn} onPress={() => Linking.openURL('tel:108')} accessibilityRole="button">
            <Ambulance size={16} color="#fff" /><Text style={styles.calloutBtnText}>Call 108 now</Text>
          </TouchableOpacity>
        </View>
      )}

      {Array.isArray(m.recommendations) && m.recommendations.length > 0 && (
        <View style={styles.recBlock}>
          <Text style={[styles.recTitle, s && { color: ink }]}>Recommendations</Text>
          {m.recommendations.map((r, i) => (
            <View key={i} style={styles.recRow}><Text style={styles.recDot}>•</Text><Text style={styles.recText}>{r}</Text></View>
          ))}
        </View>
      )}

      {!!m.followUp && <Text style={styles.followUp}>{m.followUp}</Text>}

      {m.severity && (
        <View style={styles.disclaimerRow}>
          <ShieldCheck size={13} color={colors.muted} />
          <Text style={styles.disclaimerText}>{AI_DISCLAIMER}</Text>
        </View>
      )}

      {canAct && (
        <View style={styles.cardFooter}>
          <TouchableOpacity style={styles.fbBtn2} onPress={() => onFeedback(m.id, 'like')} hitSlop={6}
            accessibilityRole="button" accessibilityLabel="Helpful" accessibilityState={{ selected: m.feedback === 'like' }}>
            <ThumbsUp size={14} color={m.feedback === 'like' ? colors.success : colors.muted} fill={m.feedback === 'like' ? colors.success : 'none'} />
            <Text style={[styles.fbText, m.feedback === 'like' && { color: colors.success }]}>Yes</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.fbBtn2} onPress={() => onFeedback(m.id, 'dislike')} hitSlop={6}
            accessibilityRole="button" accessibilityLabel="Not helpful" accessibilityState={{ selected: m.feedback === 'dislike' }}>
            <ThumbsDown size={14} color={m.feedback === 'dislike' ? colors.primary : colors.muted} fill={m.feedback === 'dislike' ? colors.primary : 'none'} />
            <Text style={[styles.fbText, m.feedback === 'dislike' && { color: colors.primary }]}>No</Text>
          </TouchableOpacity>
          <View style={{ flex: 1 }} />
          <TouchableOpacity style={styles.fbBtn2} onPress={tr.advance} disabled={tr.busy} hitSlop={6}
            accessibilityRole="button" accessibilityLabel={`Show this reply in ${TRANSLATION_NAMES[tr.next]}`} accessibilityState={{ busy: tr.busy }}>
            {tr.busy ? <ActivityIndicator size="small" color={colors.primary} /> : <Languages size={14} color={colors.muted} />}
            <Text style={styles.fbText}>{tr.busy ? 'Translating…' : TRANSLATION_LABELS[tr.next]}</Text>
          </TouchableOpacity>
          <SpeakerButton consultationId={consultationId} messageId={m.id} variant={tr.translated ? tr.shown : undefined} color={colors.muted} activeColor={colors.primary} style={styles.fbBtn2} />
          <TouchableOpacity style={styles.fbBtn2} onPress={() => onShare({ ...m, text: tr.text })} hitSlop={6} accessibilityLabel="Share this response">
            <Share2 size={14} color={colors.muted} />
          </TouchableOpacity>
        </View>
      )}
    </View>
  )
}

// Failed send: a distinct, retryable error row — never an error dressed up as
// an AI answer (web parity, DESIGN_AUDIT D5).
function ErrorRow({ m, styles, colors, onRetry, onDismiss, retrying }) {
  return (
    <View style={styles.errRow} accessibilityRole="alert">
      <AlertTriangle size={18} color={colors.danger} />
      <View style={{ flex: 1, gap: 4 }}>
        <Text style={styles.errTitle}>Your message wasn't sent.</Text>
        <Text style={styles.errDesc}>
          {m.text} Check your connection and try again. If this is an emergency,{' '}
          <Text style={styles.link} onPress={() => Linking.openURL('tel:108')}>call 108</Text>.
        </Text>
        <View style={styles.errActions}>
          {!!m.retry && (
            <TouchableOpacity style={styles.errRetry} onPress={onRetry} disabled={retrying}>
              {retrying ? <ActivityIndicator size="small" color={colors.text} /> : <RotateCw size={14} color={colors.text} />}
              <Text style={styles.errRetryText}>{retrying ? 'Sending…' : 'Try again'}</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.errDismiss} onPress={onDismiss}><Text style={styles.errDismissText}>Dismiss</Text></TouchableOpacity>
        </View>
      </View>
    </View>
  )
}

export default function ChatScreen({ navigation }) {
  const { profile } = useProfile()
  const { colors, sev } = useTheme()
  const styles = makeStyles(colors)
  const toast = useToast()
  // Consultation list / active chat live in ChatContext (shared with the drawer).
  const { activeId, selectionSeq, registerCreated, loadList, listError, reloadChats } = useChat()
  const [reloading, setReloading] = useState(false)
  const [retryingId, setRetryingId] = useState(null)
  // SOS opens the panel without an assessment: no severity badge, no "Risk 0".
  const [emergencyFromAssessment, setEmergencyFromAssessment] = useState(false)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [emergency, setEmergency] = useState(false)
  const [lastRiskScore, setLastRiskScore] = useState(null)
  const [isOffline, setIsOffline] = useState(false)
  const [analysisOpen, setAnalysisOpen] = useState(false)
  const [attachments, setAttachments] = useState([]) // [{ attachmentId, filename, kind }]
  const [attaching, setAttaching] = useState(false)
  const [keyboardUp, setKeyboardUp] = useState(false)
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
  const insets = useSafeAreaInsets()
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

  // Bottom gap: the composer must clear the keyboard while typing and the
  // gesture/home bar when it isn't (the shell is immersive, so SafeAreaView
  // deliberately doesn't apply a bottom inset here).
  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', () => setKeyboardUp(true))
    const hide = Keyboard.addListener('keyboardDidHide', () => setKeyboardUp(false))
    return () => { show.remove(); hide.remove() }
  }, [])

  // Like/dislike an AI response. Toggling the active choice clears it.
  const submitFeedback = async (messageId, feedback) => {
    if (!activeId || !messageId) return
    const current = messages.find((m) => m.id === messageId)?.feedback ?? null
    const next = current === feedback ? null : feedback
    setMessages((p) => p.map((m) => (m.id === messageId ? { ...m, feedback: next } : m)))
    try {
      await setMessageFeedback(activeId, messageId, next)
    } catch (e) {
      setMessages((p) => p.map((m) => (m.id === messageId ? { ...m, feedback: current } : m)))
      toast.error(errText(e, 'Could not save your feedback.'))
    }
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
      const cid = await ensureConsultation()
      const up = await uploadFile(asset, { scope: 'chat', chatId: cid })
      setAttachments((p) => [...p, { attachmentId: up.attachmentId, filename: up.filename, kind: up.kind }])
    } catch (e) {
      toast.error(errText(e, `Could not upload ${asset.name || 'the file'}.`))
    } finally { setAttaching(false) }
  }
  const attachPhoto = async () => {
    try {
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync()
      if (!perm.granted) return Alert.alert('Photo access is needed to attach images.')
      const res = await ImagePicker.launchImageLibraryAsync({})
      const a = !res.canceled && res.assets?.[0]
      if (a) await addAttachment({ uri: a.uri, name: a.fileName || `photo-${Date.now()}.jpg`, mimeType: a.mimeType || 'image/jpeg', size: a.fileSize })
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

  // Core send. `meta` = { inputMode, lang }. The user's message shows at once;
  // a failure marks it "Not sent" and adds a retryable error row.
  const sendText = async (text, pending, meta) => {
    setLoading(true)
    const attachmentIds = pending.map((a) => a.attachmentId)
    const attachmentNames = pending.map((a) => a.filename)
    const tmpId = `tmp-${Date.now()}`
    setMessages((p) => [...p, { id: tmpId, sender: 'user', text, attachmentNames, createdAt: new Date().toISOString(), status: MSG_SENT }])
    let cid = activeId
    try {
      cid = await ensureConsultation()
      const res = await apiSend(cid, text, attachmentIds, meta)
      setIsOffline(Boolean(res.isOfflineFallback))
      // Reconcile the optimistic bubble with the server-persisted user message.
      setMessages((p) => p.map((m) => (m.id === tmpId ? (res.userMessage ? { ...toBubble(res.userMessage), attachmentNames } : { ...m, status: MSG_RECEIVED }) : m)))
      // Attachment-only messages have no assistant reply.
      if (res.assistantMessage) {
        const bot = toBubble(res.assistantMessage)
        if (res.isOfflineFallback) bot.offline = true
        setMessages((p) => [...p, bot])
        if (bot.riskScore != null) setLastRiskScore(bot.riskScore)
        if (bot.severity === 'EMERGENCY') { setEmergency(true); setEmergencyFromAssessment(true) }
        // Opt-in: read replies to spoken messages aloud.
        if (meta.inputMode === 'voice' && ttsAvailable && await getAutoRead()) {
          tts.play(bot.id, () => loadTts(cid, bot.id)).catch(() => {})
        }
      }
      if (attachmentIds.length) loadChatAttachments(cid)
      loadList()
    } catch (e) {
      const errRow = { id: `err-${Date.now()}`, sender: 'error', text: errText(e, 'The service is unavailable right now.'), retry: { text, pending, meta, failedId: tmpId }, createdAt: new Date().toISOString() }
      setMessages((p) => [...p.map((m) => (m.id === tmpId ? { ...m, status: MSG_FAILED } : m)), errRow])
    } finally { setLoading(false) }
  }

  const send = async () => {
    const text = input.trim()
    const pending = attachments
    if ((!text && pending.length === 0) || loading) return
    // Dictated drafts carry the language Transcribe identified.
    const meta = voice.state === 'review' ? { inputMode: 'voice', lang: voice.draftLang || undefined } : { inputMode: 'text' }
    setInput(''); setAttachments([])
    await sendText(text, pending, meta)
  }
  const retrySend = async (errId) => {
    const row = messages.find((m) => m.id === errId)
    if (!row?.retry || loading) return
    setRetryingId(errId)
    setMessages((p) => p.filter((m) => m.id !== errId && m.id !== row.retry.failedId))
    await sendText(row.retry.text, row.retry.pending, row.retry.meta)
    setRetryingId(null)
  }
  const dismissError = (errId) => setMessages((p) => p.filter((m) => m.id !== errId))

  // Falls back to a "near me" search when location is refused or unavailable,
  // rather than a dead end (web parity).
  const findHospital = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        toast.info('Location is off, so the map will search near you instead.')
        Linking.openURL(HOSPITALS_NEAR_ME)
        return
      }
      const pos = await Location.getCurrentPositionAsync({})
      Linking.openURL(`https://www.google.com/maps/search/hospitals/@${pos.coords.latitude},${pos.coords.longitude},14z`)
    } catch {
      toast.info('Couldn’t get your location, so the map will search near you instead.')
      Linking.openURL(HOSPITALS_NEAR_ME)
    }
  }
  const shareLocation = async () => {
    if (!primary?.phone) return
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') { toast.error('Could not get your location. Allow location access, or call your contact instead.'); return }
      const pos = await Location.getCurrentPositionAsync({})
      const link = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`
      const sep = Platform.OS === 'ios' ? '&' : '?'
      Linking.openURL(`sms:${primary.phone}${sep}body=${encodeURIComponent(`Medical Emergency! My location: ${link}`)}`)
    } catch { toast.error('Could not get your location. Allow location access, or call your contact instead.') }
  }

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
    catch (e) { setMessages(prev); toast.error(errText(e, 'Could not unsend the message.')) }
    finally { setUnsending(false); setUnsendTarget(null) }
  }

  const shareMessage = async (m) => {
    try { await Share.share({ message: [m.severity ? sevMeta(m.severity).title : 'SankatAI', String(m.text || '').replace(/\*\*/g, '')].filter(Boolean).join('\n\n') }) }
    catch { /* user cancelled */ }
  }

  const empty = messages.length === 0 && !loading

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      {/* Wrap the whole screen so the input bar lifts fully above the keyboard
          (offset 0 since the view reaches the screen bottom). "padding" on both
          platforms + Android softwareKeyboardLayoutMode "pan" (app.json) gives the
          WhatsApp-style behaviour where the bar sits just above the keyboard. */}
      {/* Android uses softwareKeyboardLayoutMode:"resize" (app.json) — the window
          itself shrinks, so the bottom-anchored composer AND the composerFoot gap
          stay above the keyboard. Adding KAV padding there would shift it TWICE.
          ("pan" was the old mode: it aligns the focused input's bottom edge to the
          keyboard, which silently swallows any padding placed below it.)
          iOS keeps behavior="padding". */}
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={0}>
      {/* Top bar: brand + analysis + Emergency (SOS stays reachable at all times) */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBtn} onPress={() => navigation?.openDrawer?.()} hitSlop={10}><Menu size={22} color={colors.text} /></TouchableOpacity>
        <View style={styles.brandCol}>
          <Text style={styles.brand}>SankatAI</Text>
          <View style={styles.brandSubRow}>
            <Text style={styles.brandSub}>AI Health Assistant</Text>
          </View>
        </View>
        {isOffline && <View style={styles.offline}><AlertTriangle size={12} color={colors.sevHigh} /><Text style={styles.offlineText}>Offline</Text></View>}
        <TouchableOpacity style={styles.topBtn} onPress={() => setAnalysisOpen(true)}><ClipboardList size={18} color={colors.textSecondary} /></TouchableOpacity>
        <TouchableOpacity style={styles.emergencyBtn} onPress={() => { setEmergencyFromAssessment(false); setEmergency(true) }} accessibilityLabel="Emergency help">
          <Bell size={14} color={colors.sevEmergency} />
          <Text style={styles.emergencyBtnText}>Emergency</Text>
        </TouchableOpacity>
      </View>

      {/* Emergency panel: renders instantly (no animation, no data gate); the
          first action is a direct call. Severity shows only after an assessment. */}
      {emergency && (
        <View style={styles.emerg}>
          <View style={styles.emergHead}>
            <Siren size={17} color={sev.EMERGENCY.ink} />
            <Text style={styles.emergTitle} accessibilityRole="header">Emergency help</Text>
            {emergencyFromAssessment && (
              <View style={[styles.sevPill, { backgroundColor: sev.EMERGENCY.soft, borderColor: sev.EMERGENCY.border }]}>
                <Text style={[styles.sevPillText, { color: sev.EMERGENCY.ink }]}>Emergency{lastRiskScore != null ? ` · ${lastRiskScore}/100` : ''}</Text>
              </View>
            )}
            <View style={{ flex: 1 }} />
            <TouchableOpacity onPress={() => setEmergency(false)} hitSlop={10} accessibilityLabel="Close emergency panel"><X size={18} color={colors.muted} /></TouchableOpacity>
          </View>
          <Text style={styles.emergText}>{EMERGENCY_CALLOUT}</Text>
          <TouchableOpacity style={styles.emergBtnDanger} onPress={() => Linking.openURL('tel:108')} accessibilityRole="button">
            <Ambulance size={16} color="#fff" /><Text style={styles.emergBtnDangerText}>Call 108 — Ambulance</Text>
          </TouchableOpacity>
          <View style={styles.emergRow}>
            <TouchableOpacity style={[styles.emergBtn, !primary?.phone && styles.btnDisabled]} disabled={!primary?.phone} onPress={() => Linking.openURL(`tel:${primary.phone}`)}>
              <Phone size={14} color={colors.text} /><Text style={styles.emergBtnText} numberOfLines={1}>{primary?.phone ? `Call ${primary.name || 'contact'}` : 'Call contact'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.emergBtn, !primary?.phone && styles.btnDisabled]} disabled={!primary?.phone} onPress={shareLocation}>
              <MapPin size={14} color={colors.text} /><Text style={styles.emergBtnText}>Share location</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.emergBtn} onPress={findHospital}>
              <Hospital size={14} color={colors.text} /><Text style={styles.emergBtnText}>Nearby hospitals</Text>
            </TouchableOpacity>
          </View>
          {!primary?.phone && <Text style={styles.emergHint}>Add an emergency contact in your health profile to call or share your location with them.</Text>}
        </View>
      )}

        <Animated.View style={{ flex: 1, transform: [{ translateX: revealX }] }} {...revealPan.panHandlers}>
        <ScrollView ref={scrollRef} contentContainerStyle={styles.chat} onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
          {!!listError && !activeId && (
            <View style={styles.listErr}>
              <AlertTriangle size={16} color={colors.danger} />
              <View style={{ flex: 1 }}>
                <Text style={styles.errTitle}>Couldn't load your chats.</Text>
                <Text style={styles.errDesc}>You can still describe new symptoms below. If this is an emergency, call 108.</Text>
              </View>
              <TouchableOpacity style={styles.errRetry} disabled={reloading} onPress={async () => { setReloading(true); await reloadChats(); setReloading(false) }}>
                {reloading ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={styles.errRetryText}>Try again</Text>}
              </TouchableOpacity>
            </View>
          )}
          {empty ? (
            <View style={styles.greeting}>
              <View style={styles.greetBadge}><HeartPulse size={26} color={colors.primary} /></View>
              <Text style={styles.greetH}>Hi {firstName}. What symptoms are you having?</Text>
              <Text style={styles.greetP}>
                Describe what you feel in your own words. I'll ask follow-up questions and tell you how urgent it is.
                This is guidance, not a diagnosis. If someone is in danger,{' '}
                <Text style={styles.link} onPress={() => Linking.openURL('tel:108')}>call 108 now</Text>.
              </Text>
              <Text style={styles.overline}>TRY DESCRIBING</Text>
              {['I have chest pain and shortness of breath', 'High fever and headache for 2 days', "Deep cut that won't stop bleeding"].map((s) => (
                <TouchableOpacity key={s} style={styles.suggest} onPress={() => { setInput(s); inputRef.current?.focus() }}><ArrowRight size={15} color={colors.muted} /><Text style={styles.suggestText}>{s}</Text></TouchableOpacity>
              ))}
            </View>
          ) : messages.map((m) => (
            <AnimatedMsg key={m.id}>
            <View style={[styles.msgRow, m.sender === 'user' ? styles.msgRight : styles.msgLeft]}>
              {m.sender === 'user' ? (
                <View style={[styles.msgCol, { alignItems: 'flex-end' }]}>
                  <TouchableOpacity
                    style={styles.bubbleUser}
                    activeOpacity={0.9}
                    onLongPress={() => (String(m.id).startsWith('tmp-') || m.status === MSG_FAILED ? null : setUnsendTarget(m))}
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
                      {m.status === MSG_FAILED ? (
                        <><AlertTriangle size={12} color={colors.danger} /><Text style={[styles.msgMetaTime, { color: colors.danger, fontWeight: '600' }]}>Not sent</Text></>
                      ) : (
                        <>
                          <Text style={styles.msgMetaTime}>{fmtTime(m.createdAt)}</Text>
                          {m.status === MSG_RECEIVED
                            ? <CheckCheck size={13} color={colors.primary} />
                            : <SendingDots color={colors.muted} />}
                        </>
                      )}
                    </View>
                  </TouchableOpacity>
                </View>
              ) : m.sender === 'error' ? (
                <View style={[styles.msgCol, { maxWidth: '100%', flex: 1 }]}>
                  <ErrorRow m={m} styles={styles} colors={colors} retrying={retryingId === m.id} onRetry={() => retrySend(m.id)} onDismiss={() => dismissError(m.id)} />
                </View>
              ) : (
                <View style={[styles.msgCol, { alignItems: 'flex-start' }]}>
                  <BotMessage m={m} styles={styles} colors={colors} sev={sev} consultationId={activeId} onFeedback={submitFeedback} onShare={shareMessage} toast={toast} />
                </View>
              )}
            </View>
            </AnimatedMsg>
          ))}
          {loading && (
            <View style={[styles.msgRow, styles.msgLeft]} accessibilityRole="progressbar" accessibilityLabel="Analysing your symptoms">
              <View style={styles.thinking}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.thinkingText}>Analysing your symptoms…</Text></View>
            </View>
          )}
        </ScrollView>
        </Animated.View>

        {/* New chat only — centred, sitting 35% of the screen above the bottom. */}
        {empty && (
          <View style={styles.secureAnchor} pointerEvents="none">
            <SecureNote colors={colors} styles={styles} />
          </View>
        )}

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
            returnKeyType="send"
            onSubmitEditing={() => { if (!sendDisabled) send() }}
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
        {/* Blank breathing room under the composer: clears the keyboard while
            typing, and the gesture/home bar when it's dismissed. */}
        <View style={[styles.composerFoot, { height: keyboardUp ? 20 : insets.bottom + 18 }]} />
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
  emerg: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderBottomWidth: 1, paddingHorizontal: 14, paddingVertical: 12, gap: 10 },
  emergHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  emergTitle: { color: colors.danger, fontWeight: '700', fontSize: 15 },
  emergText: { color: colors.text, fontSize: 13.5, lineHeight: 19 },
  emergHint: { color: colors.muted, fontSize: 12, lineHeight: 17 },
  emergRow: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
  emergBtnDanger: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.sevEmergency, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14 },
  emergBtnDangerText: { color: '#fff', fontWeight: '700', fontSize: 15 },
  emergBtn: { flexGrow: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 12 },
  emergBtnText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  btnDisabled: { opacity: 0.45 },
  link: { color: colors.primary, fontWeight: '700', textDecorationLine: 'underline' },
  overline: { alignSelf: 'flex-start', fontSize: 11, fontWeight: '700', letterSpacing: 0.8, color: colors.muted, marginTop: 4 },
  listErr: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: radius.md, padding: 12 },
  errRow: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: 14, padding: 12 },
  errTitle: { color: colors.text, fontWeight: '700', fontSize: 14 },
  errDesc: { color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  errActions: { flexDirection: 'row', gap: 8, marginTop: 6 },
  errRetry: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.sm, paddingVertical: 7, paddingHorizontal: 12 },
  errRetryText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  errDismiss: { paddingVertical: 7, paddingHorizontal: 10 },
  errDismissText: { color: colors.muted, fontWeight: '600', fontSize: 13 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 6 },
  thinkingText: { color: colors.muted, fontSize: 13 },
  aiWho: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  aiMark: { width: 24, height: 24, borderRadius: 7, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  aiName: { flex: 1, fontSize: 13, fontWeight: '700', color: colors.text },
  aiCardOffline: { borderStyle: 'dashed', borderColor: colors.warningBorder },
  offlineAlert: { flexDirection: 'row', gap: 8, alignItems: 'flex-start', backgroundColor: colors.warningSoft, borderColor: colors.warningBorder, borderWidth: 1, borderRadius: 10, padding: 10 },
  offlineAlertText: { flex: 1, color: colors.text, fontSize: 12.5, lineHeight: 18 },
  translated: { fontSize: 11.5, color: colors.muted, fontStyle: 'italic', marginTop: -4 },
  calloutBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.sevEmergency, borderRadius: radius.md, paddingVertical: 11, marginTop: 8 },
  calloutBtnText: { color: '#fff', fontWeight: '700', fontSize: 14 },
  chat: { padding: 16, gap: 12, flexGrow: 1 },
  greeting: { alignItems: 'center', marginTop: 40 },
  greetBadge: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  greetH: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  greetP: { color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  suggest: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 13, marginTop: 10, width: '100%' },
  suggestText: { flex: 1, color: colors.textSecondary },
  msgRow: { flexDirection: 'row' },
  msgLeft: { justifyContent: 'flex-start' },
  msgRight: { justifyContent: 'flex-end' },
  // User keeps a tinted bubble; the assistant renders as plain text on the page
  // background (ChatGPT/Claude style) — no card, border or radius.
  bubbleUser: { maxWidth: '100%', backgroundColor: colors.surface2, borderRadius: 16, borderBottomRightRadius: 4, paddingVertical: 10, paddingHorizontal: 14 },
  bubbleBot: { maxWidth: '100%', paddingVertical: 2, paddingHorizontal: 0 },
  // --- AI response card ---
  aiCard: { width: '100%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 14, gap: 10 },
  aiCardHead: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sevIcon: { width: 30, height: 30, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  sevTitle: { flex: 1, fontSize: 13, fontWeight: '800', letterSpacing: 0.3 },
  sevPill: { borderRadius: 999, borderWidth: 1, borderColor: 'transparent', paddingVertical: 3, paddingHorizontal: 9 },
  sevPillText: { fontSize: 11, fontWeight: '700' },
  aiBody: { fontSize: 14.5, lineHeight: 21, color: colors.text },
  callout: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: 12, padding: 12 },
  calloutText: { fontSize: 13.5, fontWeight: '700', color: colors.danger, lineHeight: 19 },
  recBlock: { gap: 4 },
  recTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 2 },
  recRow: { flexDirection: 'row', gap: 8, paddingLeft: 2 },
  recDot: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  recText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: colors.textSecondary },
  followUp: { fontSize: 13, color: colors.muted, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 },
  disclaimerRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  disclaimerText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: colors.muted },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, flexWrap: 'wrap', borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 },
  cardTime: { fontSize: 11, color: colors.muted },
  fbBtn2: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  fbText: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  msgMetaRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: 5, marginTop: 5 },
  msgMetaTime: { fontSize: 10.5, color: colors.muted },
  // --- composer extras ---
  // pinned height — otherwise the horizontal list stretches down the column
  chipsScroll: { flexGrow: 0, flexShrink: 0, maxHeight: 40 },
  chipsRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, paddingVertical: 4 },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, height: 32, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: 999, paddingHorizontal: 12 },
  chipText: { fontSize: 12.5, color: colors.textSecondary, fontWeight: '600', lineHeight: 16 },
  micBtn: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  // New-chat only: centred overlay pinned 35% of the screen above the bottom.
  secureAnchor: { position: 'absolute', left: 0, right: 0, bottom: '35%', alignItems: 'center' },
  // Light grey pill, slim red border, slow fade in/out (see SecureNote).
  secureRow: { flexDirection: 'row', alignItems: 'center', gap: 5, paddingVertical: 6, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, borderColor: colors.primary, backgroundColor: colors.surface2 },
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
  input: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, paddingHorizontal: 14, paddingVertical: 10, fontSize: 15, color: colors.text, backgroundColor: colors.bg },
  sendBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  modalCenter: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 28 },
  unsendCard: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
  unsendTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  unsendPreview: { marginTop: 10, fontSize: 13.5, lineHeight: 19, color: colors.textSecondary, backgroundColor: colors.surface2, borderRadius: radius.md, padding: 10 },
  unsendNote: { marginTop: 10, fontSize: 12, color: colors.muted },
  unsendActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  unsendCancel: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface2 },
  unsendCancelText: { color: colors.textSecondary, fontWeight: '700' },
  unsendConfirm: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.sevEmergency },
  unsendConfirmText: { color: '#fff', fontWeight: '700' },
  modalScrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
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
