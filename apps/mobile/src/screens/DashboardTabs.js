// ChatGPT-style shell: the active page fills the screen; everything else lives
// behind a left slide-in drawer (open via the ☰ button or an edge swipe).
// Built on RN's Animated + PanResponder so it needs no extra native deps and
// runs reliably in Expo Go.

import { useCallback, useMemo, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, Animated, PanResponder, Dimensions, StyleSheet, ScrollView } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { MessageSquare, User, FolderOpen, Siren, Settings as SettingsIcon, HeartPulse, Plus, Clock, Stethoscope, MapPin, FileText, Phone, ShieldCheck, ChevronRight } from 'lucide-react-native'
import { radius, sevColor } from '../theme'
import { useProfile } from '../context/ProfileContext'
import { useTheme } from '../context/ThemeContext'
import { useChat } from '../context/ChatContext'
import ChatScreen from './tabs/ChatScreen'
import HistoryScreen from './tabs/HistoryScreen'
import ProfileScreen from './tabs/ProfileScreen'
import DocumentsScreen from './tabs/DocumentsScreen'
import EmergencyScreen from './tabs/EmergencyScreen'
import SettingsScreen from './tabs/SettingsScreen'

const PAGES = [
  { key: 'Chat', label: 'Chat', Icon: MessageSquare, Comp: ChatScreen },
  { key: 'History', label: 'History', Icon: Clock, Comp: HistoryScreen },
  { key: 'Documents', label: 'File Storage', Icon: FolderOpen, Comp: DocumentsScreen },
  { key: 'Emergency', label: 'Emergency', Icon: Siren, Comp: EmergencyScreen },
  { key: 'Settings', label: 'Settings', Icon: SettingsIcon, Comp: SettingsScreen },
  // reachable from the user card, not the nav list (the profile page is the
  // "health profile" — a separate nav entry would duplicate it)
  { key: 'Profile', label: 'Health Profile', Icon: User, Comp: ProfileScreen, hidden: true },
]
const isPage = (name) => PAGES.some((p) => p.key === name)

function QuickAction({ Icon, title, sub, danger, onPress, colors }) {
  const styles = makeStyles(colors)
  return (
    <TouchableOpacity style={styles.quickItem} onPress={onPress} activeOpacity={0.85}>
      <View style={[styles.quickIc, danger && { backgroundColor: colors.primarySoft }]}>
        <Icon size={17} color={danger ? colors.sevEmergency : colors.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={[styles.quickTitleText, danger && { color: colors.sevEmergency }]}>{title}</Text>
        <Text style={styles.quickSub}>{sub}</Text>
      </View>
    </TouchableOpacity>
  )
}

export default function DashboardTabs({ navigation }) {
  const { profile } = useProfile()
  const { colors } = useTheme()
  const { startNew } = useChat()
  const styles = makeStyles(colors)
  const [active, setActive] = useState('Chat')
  const [open, setOpen] = useState(false)

  const screenW = Dimensions.get('window').width
  const DRAWER_W = Math.min(320, Math.round(screenW * 0.82))
  const tx = useRef(new Animated.Value(-DRAWER_W)).current
  const scrim = useRef(new Animated.Value(0)).current

  const animateTo = (toValue, dim, after) => {
    Animated.parallel([
      Animated.timing(tx, { toValue, duration: 240, useNativeDriver: true }),
      Animated.timing(scrim, { toValue: dim, duration: 240, useNativeDriver: true }),
    ]).start(after)
  }
  const openDrawer = () => { setOpen(true); animateTo(0, 1) }
  const closeDrawer = () => animateTo(-DRAWER_W, 0, () => setOpen(false))
  const go = (key) => { setActive(key); closeDrawer() }

  // Swipe right anywhere in the left 20% of the screen to open the drawer; drag
  // on the open drawer to close. Capture-phase so it wins over page content,
  // but ONLY for a rightward drag started inside that zone — leftward gestures
  // (e.g. the chat's swipe-to-see-time) pass straight through.
  const EDGE_ZONE = screenW * 0.2
  const edgePan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_e, g) => g.x0 <= EDGE_ZONE && g.dx > 8 && Math.abs(g.dy) < 20,
      onMoveShouldSetPanResponder: (_e, g) => g.x0 <= EDGE_ZONE && g.dx > 8 && Math.abs(g.dy) < 20,
      onPanResponderMove: (_e, g) => { tx.setValue(Math.min(0, -DRAWER_W + Math.max(0, g.dx))); scrim.setValue(Math.max(0, Math.min(1, g.dx / DRAWER_W))) },
      onPanResponderRelease: (_e, g) => (g.dx > DRAWER_W * 0.4 ? (setOpen(true), animateTo(0, 1)) : closeDrawer()),
    }),
  ).current
  const drawerPan = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => g.dx < -8 && Math.abs(g.dy) < 20,
      onMoveShouldSetPanResponderCapture: (_e, g) => g.dx < -8 && Math.abs(g.dy) < 20,
      onPanResponderMove: (_e, g) => { tx.setValue(Math.max(-DRAWER_W, Math.min(0, g.dx))); scrim.setValue(Math.max(0, Math.min(1, 1 + g.dx / DRAWER_W))) },
      onPanResponderRelease: (_e, g) => (g.dx < -DRAWER_W * 0.3 ? closeDrawer() : animateTo(0, 1)),
    }),
  ).current

  // Navigation handed to each page: page names switch the drawer view; other
  // routes (ProfileSetup, Login) delegate to the real stack navigator.
  const pageNav = useMemo(() => ({
    navigate: (name, params) => (isPage(name) ? go(name) : navigation.navigate(name, params)),
    reset: (...a) => navigation.reset(...a),
    goBack: () => navigation.goBack(),
    openDrawer,
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [navigation])

  const ActiveComp = PAGES.find((p) => p.key === active)?.Comp || ChatScreen
  const fullName = [profile?.firstName, profile?.middleName, profile?.lastName].filter(Boolean).join(' ') || 'Your profile'

  const newChat = () => { startNew(); go('Chat') }

  return (
    <View style={styles.root}>
      {/* Active page */}
      <View style={styles.page} {...(open ? {} : edgePan.panHandlers)}><ActiveComp navigation={pageNav} /></View>

      {/* Scrim */}
      {open && (
        <Animated.View style={[styles.scrim, { opacity: scrim }]} pointerEvents={open ? 'auto' : 'none'}>
          <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={closeDrawer} />
        </Animated.View>
      )}

      {/* Drawer */}
      <Animated.View style={[styles.drawer, { width: DRAWER_W, transform: [{ translateX: tx }] }]} {...drawerPan.panHandlers}>
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark}><HeartPulse size={22} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.brand}>Sankat<Text style={{ color: colors.primary }}>.AI</Text></Text>
              <Text style={styles.brandSub}>AI Health Assistant</Text>
            </View>
          </View>

          <TouchableOpacity style={styles.newChatBtn} onPress={newChat}>
            <Plus size={17} color={colors.primary} />
            <Text style={styles.newChatText}>New Chat</Text>
          </TouchableOpacity>

          <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 10 }} showsVerticalScrollIndicator={false}>
            <View style={styles.navList}>
              {PAGES.filter((p) => !p.hidden).map((p) => {
                const on = active === p.key
                return (
                  <TouchableOpacity key={p.key} style={[styles.navItem, on && styles.navItemOn]} onPress={() => go(p.key)}>
                    <p.Icon size={19} color={on ? colors.primary : colors.textSecondary} />
                    <Text style={[styles.navLabel, on && styles.navLabelOn]}>{p.label}</Text>
                  </TouchableOpacity>
                )
              })}
            </View>

            <View style={styles.separator} />

            <Text style={styles.quickTitle}>Quick Actions</Text>
            <QuickAction Icon={Stethoscope} title="Symptom Checker" sub="Check your symptoms" onPress={() => go('Chat')} colors={colors} />
            <QuickAction Icon={MapPin} title="Find Nearby Hospitals" sub="Hospitals near you" onPress={() => go('Emergency')} colors={colors} />
            <QuickAction Icon={FileText} title="Upload Reports" sub="Get AI analysis" onPress={() => go('Documents')} colors={colors} />
            <QuickAction Icon={Phone} title="Emergency SOS" sub="Call for immediate help" danger onPress={() => go('Emergency')} colors={colors} />

            <View style={styles.disclaimer}>
              <View style={styles.disclaimerHead}>
                <ShieldCheck size={15} color={colors.sevModerate} />
                <Text style={styles.disclaimerTitle}>Disclaimer</Text>
              </View>
              <Text style={styles.disclaimerText}>
                SankatAI is not a substitute for professional medical advice, diagnosis or treatment.
                In life-threatening situations, call emergency services immediately.
              </Text>
            </View>
            {/* profile card sits last, under the disclaimer */}
          <TouchableOpacity style={styles.userRow} onPress={() => go('Profile')} activeOpacity={0.8}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(profile?.firstName?.[0] || 'U').toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.userName} numberOfLines={1}>{fullName}</Text>
              <Text style={styles.userEmail} numberOfLines={1}>View profile</Text>
            </View>
            <ChevronRight size={16} color={colors.muted} />
          </TouchableOpacity>
          </ScrollView>

        </SafeAreaView>
      </Animated.View>

    </View>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  page: { flex: 1 },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(15,23,42,0.45)' },
  drawer: { position: 'absolute', top: 0, left: 0, bottom: 0, backgroundColor: colors.surface, borderRightColor: colors.border, borderRightWidth: 1, paddingHorizontal: 14, elevation: 16, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 12, shadowOffset: { width: 2, height: 0 } },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 14, paddingHorizontal: 6 },
  brand: { fontSize: 19, fontWeight: '800', color: colors.text },
  brandMark: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  brandSub: { fontSize: 11, color: colors.muted },
  newChatBtn: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, marginBottom: 12 },
  newChatText: { color: colors.primary, fontWeight: '700', fontSize: 14.5 },
  quickTitle: { fontSize: 11, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase', color: colors.muted, marginBottom: 8, paddingHorizontal: 2 },
  quickItem: { flexDirection: 'row', alignItems: 'center', gap: 11, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, padding: 10, marginBottom: 8 },
  quickIc: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.surface2 },
  quickTitleText: { fontSize: 13.5, fontWeight: '700', color: colors.text },
  quickSub: { fontSize: 11.5, color: colors.muted },
  disclaimer: { marginTop: 10, padding: 12, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  disclaimerHead: { flexDirection: 'row', alignItems: 'center', gap: 7, marginBottom: 6 },
  disclaimerTitle: { fontSize: 13, fontWeight: '700', color: colors.text },
  disclaimerText: { fontSize: 11.5, lineHeight: 17, color: colors.textSecondary },
  navList: { gap: 4, marginTop: 8 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 13, paddingHorizontal: 12, borderRadius: radius.md },
  navItemOn: { backgroundColor: colors.primarySoft },
  navLabel: { fontSize: 15, fontWeight: '600', color: colors.textSecondary },
  navLabelOn: { color: colors.primary },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 12, marginHorizontal: 2 },
  userRow: { flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 10, paddingVertical: 10, marginTop: 12 },
  avatar: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontWeight: '800', fontSize: 17 },
  userName: { fontSize: 14, fontWeight: '700', color: colors.text },
  userEmail: { fontSize: 12, color: colors.muted },
})
