import 'react-native-get-random-values'
import { useEffect, useMemo, useRef, useState } from 'react'
import { ActivityIndicator, Animated, KeyboardAvoidingView, Platform, ScrollView, Share, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native'
import AsyncStorage from '@react-native-async-storage/async-storage'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, ArrowRight, HeartPulse, RotateCcw, Send, ShieldCheck } from 'lucide-react-native'
import { uuidV4 } from '@sankatai/shared'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { API_BASE_URL } from '../config'
import { fetchWithTimeout } from '../lib/api'
import FollowUpQuestionnaire from '../components/FollowUpQuestionnaire'

const SAVE_KEY = 'sankatai:guest-chat'
const MAX_TURNS = 10
const newId = () => uuidV4((bytes) => globalThis.crypto.getRandomValues(bytes))
const wireMessages = (items) => items.flatMap((message) => {
  if (message.sender === 'user') return [{ role: 'user', content: message.text, createdAt: message.createdAt, ...(message.answers && { answers: message.answers }) }]
  if (message.sender === 'bot' && message.signature) return [{ role: 'assistant', content: message.raw, createdAt: message.createdAt, lang: message.lang, isOfflineFallback: Boolean(message.offline), signature: message.signature }]
  return []
})
const parseReply = (raw) => {
  try {
    const value = JSON.parse(raw)
    return {
      text: value.advice || '', severity: value.severity || null,
      questions: value.followUpQuestions || [], questionnaire: value.questionnaire || [],
      intro: value.reasoning || '', recommendations: value.recommendations || [],
      details: {
        seekCare: typeof value.seekCare === 'string' ? value.seekCare : '',
        homeCare: Array.isArray(value.homeCare) ? value.homeCare : [],
        warningSigns: Array.isArray(value.warningSigns) ? value.warningSigns : [],
        likelyCauses: Array.isArray(value.likelyCauses) ? value.likelyCauses : [],
        safetyNote: typeof value.safetyNote === 'string' ? value.safetyNote : '',
      },
    }
  } catch { return { text: raw, severity: null, questions: [], questionnaire: [], recommendations: [], details: null } }
}

export default function GuestChatScreen({ navigation }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [guestId, setGuestId] = useState(newId)
  const [messages, setMessages] = useState([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [limitReached, setLimitReached] = useState(false)
  const scroll = useRef(null)
  const turns = useMemo(() => messages.filter((message) => message.sender === 'user').length, [messages])

  useEffect(() => { scroll.current?.scrollToEnd({ animated: true }) }, [messages, busy])

  const send = async (override = null, answers = null) => {
    const text = String(override ?? draft).trim()
    if (!text || busy || limitReached) return
    const user = { id: `guest-user-${Date.now()}`, sender: 'user', text, createdAt: new Date().toISOString(), ...(answers && { answers }) }
    const next = [...messages, user]
    setMessages(next); setDraft(''); setBusy(true); setError('')
    try {
      const response = await fetchWithTimeout(`${API_BASE_URL}/api/guest/chat`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ guestId, messages: wireMessages(next) }),
      })
      let data = {}
      try { data = await response.json() } catch { /* report status below */ }
      if (!response.ok) {
        const err = new Error(data.detail || `Request failed (${response.status})`)
        err.status = response.status
        throw err
      }
      const reply = data.reply
      const bot = { id: `guest-bot-${Date.now()}`, sender: 'bot', raw: reply.content, ...parseReply(reply.content), createdAt: reply.createdAt, lang: reply.lang, offline: Boolean(reply.isOfflineFallback), signature: reply.signature }
      setMessages((current) => [...current, bot])
    } catch (err) {
      if (err.status === 409) setLimitReached(true)
      setError(err.message || 'The service is unavailable right now. Your draft is still here.')
      setMessages((current) => current.filter((message) => message.id !== user.id))
      setDraft(text)
    } finally { setBusy(false) }
  }

  const reset = () => { setMessages([]); setGuestId(newId()); setDraft(''); setLimitReached(false); setError('') }
  const save = async () => {
    try {
      await AsyncStorage.setItem(SAVE_KEY, JSON.stringify({ guestId, messages: wireMessages(messages) }))
      navigation.navigate('Login')
    } catch { setError('Could not prepare this chat to save. Please try again.') }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.top}>
        <TouchableOpacity style={styles.back} onPress={() => navigation.goBack()} accessibilityLabel="Back to sign in"><ArrowLeft size={20} color={colors.text} /></TouchableOpacity>
        <View style={styles.brandIcon}><HeartPulse size={18} color={colors.onPrimary} /></View>
        <View style={{ flex: 1 }}><Text style={styles.brand}>SankatAI</Text><Text style={styles.subBrand}>Private guest chat</Text></View>
        {!!messages.length && <TouchableOpacity style={styles.reset} onPress={reset}><RotateCcw size={15} color={colors.textSecondary} /><Text style={styles.resetText}>New</Text></TouchableOpacity>}
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView ref={scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          {!messages.length ? (
            <View style={styles.hero}>
              <View style={styles.heroMark}><HeartPulse size={26} color={colors.onPrimary} /></View>
              <Text style={styles.eyebrow}>HERE WHEN YOU NEED US</Text>
              <Text style={styles.title}>Let’s take care of you.</Text>
              <Text style={styles.intro}>Describe what’s going on. You can start without making an account.</Text>
              <View style={styles.privacy}><ShieldCheck size={15} color={colors.primary} /><Text style={styles.privacyText}>Nothing is saved unless you choose to keep this chat.</Text></View>
              <View style={styles.prompts}>
                {['Chest pain and trouble breathing', 'Fever and headache since yesterday', 'A cut that won’t stop bleeding'].map((item) => <TouchableOpacity key={item} style={styles.prompt} onPress={() => setDraft(item)}><Text style={styles.promptText}>{item}</Text><ArrowRight size={16} color={colors.primary} /></TouchableOpacity>)}
              </View>
            </View>
          ) : messages.map((message) => message.sender === 'user' ? (
            <View key={message.id} style={styles.userRow}><Text style={styles.userBubble}>{message.text}</Text></View>
          ) : (
            <AnimatedGuestMessage key={message.id} styles={styles} colors={colors} message={message} onAnswer={(text, answers) => send(text, answers)} busy={busy} />
          ))}
          {busy && <View style={styles.thinking}><ActivityIndicator size="small" color={colors.primary} /><Text style={styles.thinkingText}>SankatAI is thinking…</Text></View>}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {limitReached && <View style={styles.limit}><Text style={styles.limitText}>You’ve reached the guest chat limit. Save this conversation to continue in your account.</Text><TouchableOpacity style={styles.saveButton} onPress={save}><Text style={styles.saveText}>Save this chat</Text><ArrowRight size={16} color={colors.onPrimary} /></TouchableOpacity></View>}
        </ScrollView>

        {!limitReached && <View style={styles.composerWrap}>
          {!!messages.length && <TouchableOpacity style={styles.saveLink} onPress={save} disabled={busy}><Text style={styles.saveLinkText}>Save this chat to your account</Text><ArrowRight size={14} color={colors.primary} /></TouchableOpacity>}
          <View style={styles.composer}>
            <TextInput value={draft} onChangeText={setDraft} placeholder={messages.length ? 'Add more detail…' : 'What would you like help with today?'} placeholderTextColor={colors.muted} multiline maxLength={2000} style={styles.input} returnKeyType="send" onSubmitEditing={() => send()} blurOnSubmit />
            <TouchableOpacity onPress={() => send()} disabled={busy || !draft.trim()} style={[styles.sendButton, (busy || !draft.trim()) && styles.sendDisabled]} accessibilityLabel="Send message">{busy ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Send size={18} color={colors.onPrimary} />}</TouchableOpacity>
          </View>
          <Text style={styles.disclaimer}>SankatAI does not replace professional medical care. For an emergency, call 108.</Text>
        </View>}
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function AnimatedGuestMessage({ styles, colors, message, onAnswer, busy }) {
  const opacity = useRef(new Animated.Value(0)).current
  useEffect(() => { Animated.timing(opacity, { toValue: 1, duration: 240, useNativeDriver: true }).start() }, [opacity])
  const heading = message.severity ? `${message.severity[0]}${message.severity.slice(1).toLowerCase()} concern` : 'SankatAI'
  return <Animated.View style={[styles.aiCard, { opacity, transform: [{ translateY: opacity.interpolate({ inputRange: [0, 1], outputRange: [8, 0] }) }] }]}>
    <View style={styles.aiHead}><HeartPulse size={15} color={message.offline ? colors.warning : colors.primary} /><Text style={styles.aiName}>{message.offline ? 'Offline estimate' : heading}</Text></View>
    {message.offline && <Text style={styles.offline}>This is an automatic estimate, not an AI assessment.</Text>}
    {!!message.intro && <Text style={styles.replyText}>{message.intro}</Text>}
    {message.questionnaire?.length ? <FollowUpQuestionnaire items={message.questionnaire} onSubmit={onAnswer} disabled={busy} /> : message.questions?.length ? message.questions.map((question, i) => <Text key={i} style={styles.replyText}>{i + 1}. {question}</Text>) : <Text style={styles.replyText}>{message.text}</Text>}
    {!!message.recommendations?.length && <View style={styles.recommendations}><Text style={styles.sectionLabel}>Recommendations</Text>{message.recommendations.map((item, i) => <Text key={i} style={styles.replyText}>•  {item}</Text>)}</View>}
    {!!message.details?.seekCare && <View style={styles.recommendations}><Text style={styles.sectionLabel}>When to get care</Text><Text style={styles.replyText}>{message.details.seekCare}</Text></View>}
    {!!message.details?.homeCare?.length && <View style={styles.recommendations}><Text style={styles.sectionLabel}>What you can do now</Text>{message.details.homeCare.map((item, i) => <Text key={i} style={styles.replyText}>•  {item}</Text>)}</View>}
    {!!message.details?.warningSigns?.length && <View style={styles.recommendations}><Text style={styles.sectionLabel}>Get help sooner if</Text>{message.details.warningSigns.map((item, i) => <Text key={i} style={styles.replyText}>•  {item}</Text>)}</View>}
    {!!message.details?.likelyCauses?.length && <View style={styles.recommendations}><Text style={styles.sectionLabel}>Possible causes</Text>{message.details.likelyCauses.map((item, i) => <Text key={i} style={styles.replyText}>•  {item}</Text>)}</View>}
    {!!message.details?.safetyNote && <Text style={styles.offline}>{message.details.safetyNote}</Text>}
    <TouchableOpacity style={styles.share} onPress={() => Share.share({ message: [message.text, message.details?.seekCare, ...(message.recommendations || [])].filter(Boolean).join('\n\n') || message.raw })}><Text style={styles.shareText}>Share this guidance</Text></TouchableOpacity>
    <Text style={styles.messageFoot}>{message.offline ? 'Check the advice with a qualified professional.' : 'This is guidance, not a diagnosis.'}</Text>
  </Animated.View>
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingVertical: 11, backgroundColor: colors.surface, borderBottomWidth: 1, borderBottomColor: colors.border },
  back: { width: 34, height: 38, alignItems: 'center', justifyContent: 'center' },
  brandIcon: { width: 34, height: 34, borderRadius: 11, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  brand: { color: colors.text, fontSize: 15, fontWeight: '800' }, subBrand: { color: colors.muted, fontSize: 11, marginTop: 1 },
  reset: { flexDirection: 'row', alignItems: 'center', gap: 5, borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingVertical: 7, paddingHorizontal: 10 }, resetText: { color: colors.textSecondary, fontSize: 12, fontWeight: '600' },
  content: { flexGrow: 1, padding: 16, gap: 12, paddingBottom: 22 },
  hero: { marginTop: 22, backgroundColor: colors.surface, borderRadius: radius.xl, borderWidth: 1, borderColor: colors.border, padding: 20, overflow: 'hidden' },
  heroMark: { width: 52, height: 52, borderRadius: 17, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 17 },
  eyebrow: { color: colors.primary, fontSize: 10, fontWeight: '800', letterSpacing: 1.1 }, title: { color: colors.text, fontSize: 26, lineHeight: 32, fontWeight: '800', marginTop: 8 },
  intro: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 8 },
  privacy: { flexDirection: 'row', alignItems: 'center', gap: 7, marginTop: 14 }, privacyText: { color: colors.muted, fontSize: 12, flex: 1 },
  prompts: { gap: 8, marginTop: 18 }, prompt: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, paddingHorizontal: 12, paddingVertical: 9, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.bg }, promptText: { color: colors.textSecondary, flex: 1, fontSize: 13, fontWeight: '600' },
  userRow: { alignItems: 'flex-end' }, userBubble: { maxWidth: '88%', color: colors.text, backgroundColor: colors.surfaceTint || colors.primarySoft, borderRadius: 17, borderBottomRightRadius: 5, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, lineHeight: 21 },
  aiCard: { maxWidth: '96%', alignSelf: 'flex-start', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14 },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 7 }, aiName: { color: colors.text, fontWeight: '800', fontSize: 13 },
  replyText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 }, offline: { color: colors.warning, fontSize: 12, lineHeight: 17 },
  recommendations: { gap: 6 }, sectionLabel: { color: colors.primaryText || colors.primary, fontWeight: '800', fontSize: 12 },
  messageFoot: { color: colors.muted, fontSize: 11, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: 8 },
  share: { alignSelf: 'flex-start', paddingVertical: 5 }, shareText: { color: colors.primary, fontWeight: '700', fontSize: 12 },
  thinking: { flexDirection: 'row', alignItems: 'center', gap: 8, alignSelf: 'flex-start', padding: 11 }, thinkingText: { color: colors.muted, fontSize: 13 },
  error: { color: colors.danger, backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: radius.md, padding: 10, fontSize: 13 },
  limit: { gap: 10, borderWidth: 1, borderColor: colors.warningBorder, backgroundColor: colors.warningSoft, borderRadius: radius.md, padding: 12 }, limitText: { color: colors.text, fontSize: 13, lineHeight: 19 },
  saveButton: { minHeight: 42, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, borderRadius: radius.md, backgroundColor: colors.primary }, saveText: { color: colors.onPrimary, fontWeight: '700', fontSize: 13 },
  composerWrap: { backgroundColor: colors.surface, borderTopWidth: 1, borderTopColor: colors.border, paddingHorizontal: 14, paddingTop: 9, paddingBottom: 6, gap: 7 },
  saveLink: { flexDirection: 'row', alignItems: 'center', alignSelf: 'center', gap: 5, paddingVertical: 2 }, saveLinkText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  composer: { flexDirection: 'row', alignItems: 'flex-end', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: 19, padding: 6, backgroundColor: colors.bg },
  input: { flex: 1, maxHeight: 100, minHeight: 38, color: colors.text, fontSize: 14, lineHeight: 19, paddingHorizontal: 9, paddingTop: 9, paddingBottom: 7 },
  sendButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: 14, backgroundColor: colors.primary }, sendDisabled: { opacity: 0.5 },
  disclaimer: { color: colors.muted, textAlign: 'center', fontSize: 10, lineHeight: 14 },
})
