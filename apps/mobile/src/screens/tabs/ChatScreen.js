import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, KeyboardAvoidingView, Platform, ActivityIndicator, Keyboard, Linking, Modal, Alert, Animated, PanResponder, Dimensions, Share, Image } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import * as DocumentPicker from 'expo-document-picker'
import * as ImagePicker from 'expo-image-picker'
import { ArrowRight, Ambulance, MapPin, HeartPulse, ClipboardList, Gauge, AlertTriangle, X, Phone, Activity, ThumbsUp, ThumbsDown, Menu, Paperclip, FileText, Image as ImageIcon, Trash2, BadgeCheck, Bell, ShieldCheck, Share2, Mic, CheckCheck, Siren, Lock } from 'lucide-react-native'
import { radius, sevColor } from '../../theme'
import { useTheme } from '../../context/ThemeContext'
import { useProfile } from '../../context/ProfileContext'
import { useChat } from '../../context/ChatContext'
import { createConsultation, getMessages, sendMessage as apiSend, setMessageFeedback, unsendMessage, fetchWithTimeout } from '../../lib/api'
import { uploadFile, deleteUpload, listUploads } from '../../lib/uploads'
import { API_BASE_URL } from '../../config'
import { fmtTime, MSG_SENT, MSG_RECEIVED, sevMeta, AI_DISCLAIMER, EMERGENCY_CALLOUT, CHAT_SUGGESTIONS } from '../../lib/chat'
import { isImageFile, openInAppBrowser } from '../../lib/preview'
import FilePreview from '../../components/FilePreview'

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
  : { id: m.id, sender: 'bot', ...normalize(m.content), raw: m.content, feedback: m.feedback ?? null, createdAt: m.createdAt })

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

export default function ChatScreen({ navigation }) {
  const { profile } = useProfile()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  // Consultation list / active chat live in ChatContext (shared with the drawer).
  const { activeId, selectionSeq, registerCreated, loadList } = useChat()
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
    } catch {
      setMessages((p) => p.map((m) => (m.id === messageId ? { ...m, feedback: current } : m)))
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
      Alert.alert('Attachment failed', e.message || 'Please try again.')
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

  const send = async () => {
    const text = input.trim()
    const pending = attachments
    if ((!text && pending.length === 0) || loading) return
    setInput(''); setAttachments([]); setLoading(true)
    const attachmentIds = pending.map((a) => a.attachmentId)
    const attachmentNames = pending.map((a) => a.filename)
    const tmpId = `tmp-${Date.now()}`
    try {
      const cid = await ensureConsultation()
      setMessages((p) => [...p, { id: tmpId, sender: 'user', text, attachmentNames, createdAt: new Date().toISOString(), status: MSG_SENT }])
      const res = await apiSend(cid, text, attachmentIds)
      setIsOffline(Boolean(res.isOfflineFallback))
      // Reconcile the optimistic bubble with the server-persisted user message.
      if (res.userMessage) {
        setMessages((p) => p.map((m) => (m.id === tmpId ? { ...toBubble(res.userMessage), attachmentNames } : m)))
      }
      // Attachment-only messages have no assistant reply.
      if (res.assistantMessage) {
        const bot = toBubble(res.assistantMessage)
        setMessages((p) => [...p, bot])
        if (bot.riskScore != null) setLastRiskScore(bot.riskScore)
        if (bot.severity === 'EMERGENCY') setEmergency(true)
      }
      if (attachmentIds.length) loadChatAttachments(cid)
      loadList()
    } catch (e) {
      setMessages((p) => [...p, { id: `err-${Date.now()}`, sender: 'bot', text: e.message || 'Service unavailable.', createdAt: new Date().toISOString() }])
    } finally { setLoading(false) }
  }

  const findHospital = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return Alert.alert('Location permission is needed to find hospitals.')
      const pos = await Location.getCurrentPositionAsync({})
      Linking.openURL(`https://www.google.com/maps/search/hospitals/@${pos.coords.latitude},${pos.coords.longitude},14z`)
    } catch { Alert.alert('Could not get your location.') }
  }
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
      {/* Top bar: brand + verified badge + analysis + Emergency */}
      <View style={styles.topBar}>
        <TouchableOpacity style={styles.topBtn} onPress={() => navigation?.openDrawer?.()} hitSlop={10}><Menu size={22} color={colors.text} /></TouchableOpacity>
        <View style={styles.brandCol}>
          <Text style={styles.brand}>SankatAI</Text>
          <View style={styles.brandSubRow}>
            <Text style={styles.brandSub}>AI Health Assistant</Text>
            <BadgeCheck size={12} color={colors.primary} />
          </View>
        </View>
        {isOffline && <View style={styles.offline}><AlertTriangle size={12} color={colors.sevHigh} /><Text style={styles.offlineText}>Offline</Text></View>}
        <TouchableOpacity style={styles.topBtn} onPress={() => setAnalysisOpen(true)}><ClipboardList size={18} color={colors.textSecondary} /></TouchableOpacity>
        <TouchableOpacity style={styles.emergencyBtn} onPress={() => setEmergency(true)}>
          <Bell size={14} color={colors.sevEmergency} />
          <Text style={styles.emergencyBtnText}>Emergency</Text>
        </TouchableOpacity>
      </View>

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
            <View style={styles.greeting}>
              <View style={styles.greetBadge}><HeartPulse size={26} color={colors.primary} /></View>
              <Text style={styles.greetH}>Hi {firstName}, how can I help?</Text>
              <Text style={styles.greetP}>Describe your symptoms and I'll assess the urgency.</Text>
              {['I have chest pain and shortness of breath', 'High fever and headache for 2 days', "Deep cut that won't stop bleeding"].map((s) => (
                <TouchableOpacity key={s} style={styles.suggest} onPress={() => setInput(s)}><Text style={styles.suggestText}>{s}</Text></TouchableOpacity>
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
                  <View style={[styles.aiCard, m.severity && { borderColor: `${sevColor(m.severity)}55` }]}>
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

                    {!!m.text && <Text style={styles.aiBody}>{m.text}</Text>}

                    {m.severity === 'EMERGENCY' && (
                      <View style={styles.callout}>
                        <Phone size={16} color={colors.sevEmergency} />
                        <Text style={styles.calloutText}>{EMERGENCY_CALLOUT}</Text>
                      </View>
                    )}

                    {Array.isArray(m.recommendations) && m.recommendations.length > 0 && (
                      <View style={styles.recBlock}>
                        <Text style={[styles.recTitle, m.severity && { color: sevColor(m.severity) }]}>Recommendations</Text>
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

                    <View style={styles.cardFooter}>
                      <Text style={styles.cardTime}>{fmtTime(m.createdAt)}</Text>
                      <View style={{ flex: 1 }} />
                      {m.raw && (
                        <>
                          <TouchableOpacity style={styles.fbBtn2} onPress={() => submitFeedback(m.id, 'like')} hitSlop={6}>
                            <ThumbsUp size={14} color={m.feedback === 'like' ? colors.success : colors.muted} fill={m.feedback === 'like' ? colors.success : 'none'} />
                            <Text style={[styles.fbText, m.feedback === 'like' && { color: colors.success }]}>Helpful</Text>
                          </TouchableOpacity>
                          <TouchableOpacity style={styles.fbBtn2} onPress={() => submitFeedback(m.id, 'dislike')} hitSlop={6}>
                            <ThumbsDown size={14} color={m.feedback === 'dislike' ? colors.primary : colors.muted} fill={m.feedback === 'dislike' ? colors.primary : 'none'} />
                            <Text style={[styles.fbText, m.feedback === 'dislike' && { color: colors.primary }]}>Not helpful</Text>
                          </TouchableOpacity>
                        </>
                      )}
                      <TouchableOpacity style={styles.fbBtn2} onPress={() => shareMessage(m)} hitSlop={6}>
                        <Share2 size={14} color={colors.muted} />
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              )}
            </View>
            </AnimatedMsg>
          ))}
          {loading && <View style={[styles.msgRow, styles.msgLeft]}><View style={styles.bubbleBot}><ActivityIndicator color={colors.primary} /></View></View>}
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
          <TextInput style={styles.input} value={input} onChangeText={setInput} placeholder="Describe your symptoms…" placeholderTextColor={colors.muted} />
          <TouchableOpacity
            style={styles.micBtn}
            hitSlop={6}
            onPress={() => Alert.alert('Voice input', 'Dictation is coming soon — please type your symptoms for now.')}
            accessibilityLabel="Voice input"
          >
            <Mic size={17} color={colors.textSecondary} />
          </TouchableOpacity>
          <TouchableOpacity style={styles.sendBtn} onPress={send} disabled={loading || attaching} accessibilityLabel="Send">
            <ArrowRight size={20} color="#fff" />
          </TouchableOpacity>
        </View>
        {/* Blank breathing room under the composer: clears the keyboard while
            typing, and the gesture/home bar when it's dismissed. */}
        <View style={[styles.composerFoot, { height: keyboardUp ? 20 : insets.bottom + 18 }]} />
      </KeyboardAvoidingView>

      {/* In-app image preview for chat attachments */}
      <FilePreview file={preview} onClose={() => setPreview(null)} />

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
  emerg: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1, margin: 12, borderRadius: radius.md, padding: 12 },
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
  greeting: { alignItems: 'center', marginTop: 40 },
  greetBadge: { width: 60, height: 60, borderRadius: 18, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  greetH: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  greetP: { color: colors.muted, textAlign: 'center', marginTop: 6, marginBottom: 18 },
  suggest: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 13, marginTop: 10, width: '100%' },
  suggestText: { color: colors.textSecondary },
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
  sevPill: { borderRadius: 999, paddingVertical: 3, paddingHorizontal: 9 },
  sevPillText: { fontSize: 11, fontWeight: '700' },
  aiBody: { fontSize: 14.5, lineHeight: 21, color: colors.text },
  callout: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: 12, padding: 12 },
  calloutText: { flex: 1, fontSize: 13.5, fontWeight: '700', color: colors.sevEmergency, lineHeight: 19 },
  recBlock: { gap: 4 },
  recTitle: { fontSize: 13, fontWeight: '700', color: colors.text, marginBottom: 2 },
  recRow: { flexDirection: 'row', gap: 8, paddingLeft: 2 },
  recDot: { color: colors.muted, fontSize: 13, lineHeight: 20 },
  recText: { flex: 1, fontSize: 13.5, lineHeight: 20, color: colors.textSecondary },
  followUp: { fontSize: 13, color: colors.muted, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 },
  disclaimerRow: { flexDirection: 'row', gap: 8, alignItems: 'flex-start' },
  disclaimerText: { flex: 1, fontSize: 11.5, lineHeight: 17, color: colors.muted },
  cardFooter: { flexDirection: 'row', alignItems: 'center', gap: 12, borderTopColor: colors.border, borderTopWidth: 1, paddingTop: 10 },
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
  actionDanger: { backgroundColor: colors.primary, borderColor: colors.primary },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.text },
  disclaimer: { fontSize: 11, color: colors.muted, textAlign: 'center', paddingVertical: 4 },
  aEmpty: { alignItems: 'center', justifyContent: 'center', gap: 12, padding: 40 },
  aEmptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', maxWidth: 240 },
})
