// Mobile version of the website dashboard shell: a persistent page header,
// four thumb-reachable tabs, and a More sheet for secondary destinations.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, Animated, Modal, ScrollView, StyleSheet, Pressable, Dimensions } from 'react-native'
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context'
import { HeartPulse, MessageSquare, Clock, FolderOpen, Siren, Settings, Plus, PanelRightOpen, MapPin, Upload, ShieldCheck, User, CloudOff, Activity, X, ChevronRight, Menu } from 'lucide-react-native'
import { radius } from '../theme'
import { useProfile } from '../context/ProfileContext'
import { useTheme } from '../context/ThemeContext'
import { useChat } from '../context/ChatContext'
import { fetchWithTimeout } from '../lib/api'
import { API_BASE_URL } from '../config'
import ChatScreen from './tabs/ChatScreen'
import HistoryScreen from './tabs/HistoryScreen'
import ProfileScreen from './tabs/ProfileScreen'
import DocumentsScreen from './tabs/DocumentsScreen'
import EmergencyScreen from './tabs/EmergencyScreen'
import SettingsScreen from './tabs/SettingsScreen'
import OfflineScreen from './tabs/OfflineScreen'

const NAV = [
  { key: 'Chat', label: 'Chat', Icon: MessageSquare, title: 'Symptom chat' },
  { key: 'History', label: 'History', Icon: Clock, title: 'Chat history' },
  { key: 'Documents', label: 'Documents', Icon: FolderOpen, title: 'Documents' },
  { key: 'Emergency', label: 'Emergency', Icon: Siren, title: 'Emergency' },
]
const TITLES = { Settings: 'Settings', Profile: 'Health profile', Offline: 'Offline mode' }
const PAGES = {
  Chat: ChatScreen, History: HistoryScreen, Documents: DocumentsScreen,
  Emergency: EmergencyScreen, Settings: SettingsScreen, Offline: OfflineScreen,
  Profile: ProfileScreen,
}
const isPage = (name) => Boolean(PAGES[name])

function MoreRow({ Icon, title, sub, onPress, colors, danger = false }) {
  const styles = makeStyles(colors)
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.75} accessibilityRole="button">
      <View style={[styles.rowIcon, danger && { backgroundColor: colors.dangerSoft }]}><Icon size={18} color={danger ? colors.sevEmergency : colors.primary} /></View>
      <View style={styles.rowCopy}><Text style={[styles.rowTitle, danger && { color: colors.sevEmergency }]}>{title}</Text>{!!sub && <Text style={styles.rowSub}>{sub}</Text>}</View>
      <ChevronRight size={17} color={colors.muted} />
    </TouchableOpacity>
  )
}

function DrawerNavItem({ Icon, label, selected, onPress, colors }) {
  const styles = makeStyles(colors)
  return (
    <TouchableOpacity style={[styles.drawerNavItem, selected && styles.drawerNavItemSelected]} onPress={onPress} activeOpacity={0.74} accessibilityRole="button" accessibilityState={{ selected }}>
      <Icon size={19} color={selected ? colors.primary : colors.textSecondary} strokeWidth={selected ? 2.2 : 1.9} />
      <Text style={[styles.drawerNavLabel, selected && styles.drawerNavLabelSelected]}>{label}</Text>
      {selected && <View style={styles.drawerNavIndicator} />}
    </TouchableOpacity>
  )
}

export default function DashboardTabs({ navigation }) {
  const { profile } = useProfile()
  const { colors } = useTheme()
  const { startNew } = useChat()
  const styles = makeStyles(colors)
  const insets = useSafeAreaInsets()
  const [active, setActive] = useState('Chat')
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [isOffline, setIsOffline] = useState(false)
  const [chatActions, setChatActions] = useState(null)
  const chatActionRef = useRef(null)
  const pageOpacity = useRef(new Animated.Value(1)).current
  const pageY = useRef(new Animated.Value(0)).current
  const drawerX = useRef(new Animated.Value(-360)).current
  const scrimOpacity = useRef(new Animated.Value(0)).current
  const drawerWidth = Math.min(Dimensions.get('window').width * 0.86, 360)

  useEffect(() => {
    let alive = true
    fetchWithTimeout(`${API_BASE_URL}/api/health`, {}, 8000)
      .then((r) => { if (alive) setIsOffline(!r.ok) })
      .catch(() => { if (alive) setIsOffline(true) })
    return () => { alive = false }
  }, [])

  useEffect(() => {
    pageOpacity.setValue(0)
    pageY.setValue(8)
    Animated.parallel([
      Animated.timing(pageOpacity, { toValue: 1, duration: 190, useNativeDriver: true }),
      Animated.spring(pageY, { toValue: 0, stiffness: 250, damping: 25, mass: 0.75, useNativeDriver: true }),
    ]).start()
  }, [active, pageOpacity, pageY])

  const openDrawer = useCallback(() => {
    setDrawerOpen(true)
    drawerX.setValue(-drawerWidth); scrimOpacity.setValue(0)
    Animated.parallel([
      Animated.spring(drawerX, { toValue: 0, stiffness: 280, damping: 29, mass: 0.82, useNativeDriver: true }),
      Animated.timing(scrimOpacity, { toValue: 1, duration: 190, useNativeDriver: true }),
    ]).start()
  }, [drawerX, drawerWidth, scrimOpacity])
  const closeDrawer = useCallback(() => Animated.parallel([
    Animated.timing(drawerX, { toValue: -drawerWidth, duration: 190, useNativeDriver: true }),
    Animated.timing(scrimOpacity, { toValue: 0, duration: 180, useNativeDriver: true }),
  ]).start(({ finished }) => { if (finished) setDrawerOpen(false) }), [drawerX, drawerWidth, scrimOpacity])

  const go = useCallback((key) => {
    if (isPage(key)) setActive(key)
    else navigation.navigate(key)
    if (drawerOpen) closeDrawer()
  }, [navigation, drawerOpen, closeDrawer])
  const registerChatActions = useCallback((actions) => { chatActionRef.current = actions }, [])
  const pageNav = useMemo(() => ({
    shellManaged: true,
    navigate: (name, params) => isPage(name) ? go(name) : navigation.navigate(name, params),
    reset: (...args) => navigation.reset(...args),
    goBack: () => navigation.goBack(),
    addListener: (...args) => navigation.addListener(...args),
    openDrawer,
    registerChatActions,
  }), [navigation, go, openDrawer, registerChatActions])

  const fullName = [profile?.firstName, profile?.middleName, profile?.lastName].filter(Boolean).join(' ') || 'Your profile'
  const current = NAV.find((item) => item.key === active)
  const title = current?.title || TITLES[active] || 'SankatAI'
  const ActiveComp = PAGES[active] || ChatScreen
  const newChat = () => { startNew(); setActive('Chat'); if (drawerOpen) closeDrawer() }
  const showOffline = () => go('Offline')

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={[styles.root, { paddingBottom: Math.max(insets.bottom, 8) }]}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.menuButton} onPress={openDrawer} accessibilityRole="button" accessibilityLabel="Open navigation menu" accessibilityState={{ expanded: drawerOpen }}>
            <Menu size={22} color={colors.text} strokeWidth={2.1} />
          </TouchableOpacity>
          <Text style={styles.headerTitle} numberOfLines={1}>{title}</Text>
          {isOffline && <TouchableOpacity style={styles.offlineBadge} onPress={showOffline}><CloudOff size={13} color={colors.warning} /><Text style={styles.offlineText}>AI offline</Text></TouchableOpacity>}
          <View style={styles.headerActions}>
            {active === 'Chat' && <TouchableOpacity style={styles.iconButton} onPress={newChat} accessibilityLabel="New chat"><Plus size={20} color={colors.textSecondary} /></TouchableOpacity>}
            {active === 'Chat' && <TouchableOpacity style={styles.iconButton} onPress={() => chatActionRef.current?.openAnalysis?.()} accessibilityLabel="AI analysis"><PanelRightOpen size={18} color={colors.textSecondary} /></TouchableOpacity>}
            <TouchableOpacity style={styles.sosButton} onPress={() => go('Emergency')} accessibilityRole="button" accessibilityLabel="Emergency help">
              <Siren size={15} color={colors.sevEmergency} /><Text style={styles.sosText}>SOS</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.content}>
          <Animated.View key={active} style={[styles.page, { opacity: pageOpacity, transform: [{ translateY: pageY }] }]}>
            <ActiveComp navigation={pageNav} />
          </Animated.View>
        </View>

        <Modal visible={drawerOpen} transparent animationType="none" onRequestClose={closeDrawer} statusBarTranslucent>
          <View style={styles.drawerRoot}>
            <Animated.View pointerEvents="none" style={[styles.modalScrim, { opacity: scrimOpacity }]} />
            <Pressable style={StyleSheet.absoluteFill} onPress={closeDrawer} accessibilityLabel="Close navigation menu" />
            <Animated.View style={[styles.drawer, { width: drawerWidth, paddingTop: Math.max(insets.top, 12) + 8, paddingBottom: Math.max(insets.bottom, 14), transform: [{ translateX: drawerX }] }]}>
              <View style={styles.drawerHead}>
                <View style={styles.drawerBrand}>
                  <View style={styles.drawerBrandMark}><HeartPulse size={18} color={colors.onPrimary} strokeWidth={2.3} /></View>
                  <View><Text style={styles.drawerBrandTitle}>Sankat<Text style={{ color: colors.primary }}>.AI</Text></Text><Text style={styles.drawerSubtitle}>Your health companion</Text></View>
                </View>
                <TouchableOpacity style={styles.closeButton} onPress={closeDrawer} accessibilityLabel="Close navigation menu"><X size={18} color={colors.muted} /></TouchableOpacity>
              </View>
              <TouchableOpacity style={styles.newChatButton} onPress={newChat} activeOpacity={0.8} accessibilityRole="button">
                <Plus size={17} color={colors.onPrimary} /><Text style={styles.newChatText}>New chat</Text>
              </TouchableOpacity>
              <ScrollView contentContainerStyle={styles.drawerScroll} showsVerticalScrollIndicator={false}>
                <Text style={styles.drawerSectionLabel}>MAIN MENU</Text>
                {NAV.map(({ key, label, Icon }) => <DrawerNavItem key={key} Icon={Icon} label={label} selected={active === key} colors={colors} onPress={() => go(key)} />)}
                <View style={styles.drawerDivider} />
                <Text style={styles.drawerSectionLabel}>YOUR ACCOUNT</Text>
                <DrawerNavItem Icon={User} label="Health profile" selected={active === 'Profile'} colors={colors} onPress={() => go('Profile')} />
                <DrawerNavItem Icon={Settings} label="Settings" selected={active === 'Settings'} colors={colors} onPress={() => go('Settings')} />
                <DrawerNavItem Icon={Activity} label="Service status" selected={active === 'Offline'} colors={colors} onPress={() => go('Offline')} />
                <View style={styles.drawerDivider} />
                <Text style={styles.drawerSectionLabel}>QUICK ACTIONS</Text>
                <MoreRow Icon={Upload} title="Upload a report" sub="Add a medical document or photo" colors={colors} onPress={() => go('Documents')} />
                <MoreRow Icon={MapPin} title="Find nearby hospitals" sub="Use your location to find care" colors={colors} onPress={() => { setActive('Chat'); closeDrawer(); setTimeout(() => chatActionRef.current?.findHospitals?.(), 260) }} />
              </ScrollView>
              <View style={styles.disclaimer}><ShieldCheck size={16} color={colors.primary} /><Text style={styles.disclaimerText}>SankatAI is not a substitute for professional medical advice, diagnosis or treatment. In an emergency, call 112 or 108.</Text></View>
            </Animated.View>
          </View>
        </Modal>
      </View>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  root: { flex: 1, backgroundColor: colors.bg },
  header: { minHeight: 56, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 12, backgroundColor: colors.bg, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  menuButton: { width: 38, height: 40, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  headerTitle: { flexShrink: 1, fontSize: 16, fontWeight: '700', letterSpacing: -0.2, color: colors.text },
  headerActions: { marginLeft: 'auto', flexDirection: 'row', alignItems: 'center', gap: 4 },
  iconButton: { width: 38, height: 38, alignItems: 'center', justifyContent: 'center', borderRadius: radius.md },
  sosButton: { minHeight: 37, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingHorizontal: 11, borderRadius: radius.pill || 99, borderWidth: 1, borderColor: colors.dangerBorder, backgroundColor: colors.dangerSoft },
  sosText: { color: colors.sevEmergency, fontWeight: '800', fontSize: 12 },
  offlineBadge: { flexDirection: 'row', alignItems: 'center', gap: 4, borderRadius: 99, paddingHorizontal: 7, paddingVertical: 4, backgroundColor: colors.warningSoft },
  offlineText: { fontSize: 10, color: colors.warning, fontWeight: '700' },
  content: { flex: 1, minHeight: 0 },
  page: { flex: 1 },
  drawerRoot: { flex: 1, flexDirection: 'row' },
  modalScrim: { ...StyleSheet.absoluteFillObject, backgroundColor: colors.scrim },
  drawer: { height: '100%', maxWidth: 360, paddingHorizontal: 16, backgroundColor: colors.surface, borderRightWidth: 1, borderRightColor: colors.border, borderTopRightRadius: 22, borderBottomRightRadius: 22, overflow: 'hidden' },
  drawerHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 2, paddingBottom: 18 },
  drawerBrand: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  drawerBrandMark: { width: 40, height: 40, borderRadius: 13, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  drawerBrandTitle: { color: colors.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.3 },
  drawerSubtitle: { color: colors.muted, fontSize: 11, marginTop: 2 },
  closeButton: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center', borderRadius: 17, backgroundColor: colors.surface2 },
  newChatButton: { minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.primary, marginBottom: 16 },
  newChatText: { color: colors.onPrimary, fontSize: 14, fontWeight: '700' },
  drawerScroll: { paddingBottom: 14 },
  drawerSectionLabel: { color: colors.muted, fontSize: 10, fontWeight: '800', letterSpacing: 1, paddingHorizontal: 10, paddingTop: 6, paddingBottom: 7 },
  drawerNavItem: { minHeight: 46, flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 11, borderRadius: 11, marginVertical: 2 },
  drawerNavItemSelected: { backgroundColor: colors.primarySoft },
  drawerNavLabel: { flex: 1, color: colors.textSecondary, fontSize: 14, fontWeight: '600' },
  drawerNavLabelSelected: { color: colors.primary, fontWeight: '700' },
  drawerNavIndicator: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary },
  drawerDivider: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border, marginVertical: 12, marginHorizontal: 8 },
  row: { minHeight: 66, flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 9, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
  rowIcon: { width: 39, height: 39, borderRadius: 13, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primarySoft },
  rowCopy: { flex: 1 },
  rowTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  rowSub: { color: colors.muted, fontSize: 11, marginTop: 3 },
  disclaimer: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, marginTop: 10, borderRadius: radius.md, backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1 },
  disclaimerText: { flex: 1, color: colors.textSecondary, fontSize: 11, lineHeight: 16 },
})
