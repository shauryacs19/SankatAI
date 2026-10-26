// Emergency tab (web parity): nothing animates in or waits on data — every call
// link works on first paint, and Call 108 is the first and most prominent action.
// Mobile keeps pull-to-refresh for the contacts.
import { useCallback } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import { Phone, Ambulance, Siren, Shield, Flame, MapPin, Hospital, Pencil } from 'lucide-react-native'
import { radius } from '../../theme'
import { useProfile } from '../../context/ProfileContext'
import { useTheme } from '../../context/ThemeContext'
import ScreenHeader from '../../components/ScreenHeader'
import usePullRefresh from '../../components/usePullRefresh'
import { useToast } from '../../components/Toast'

const NUMBERS = [
  { label: 'Ambulance', number: '108', Icon: Ambulance },
  { label: 'Emergency (All)', number: '112', Icon: Siren },
  { label: 'Police', number: '100', Icon: Shield },
  { label: 'Fire', number: '101', Icon: Flame },
]
const HOSPITALS_NEAR_ME = 'https://www.google.com/maps/search/hospitals+near+me'

export default function EmergencyScreen({ navigation }) {
  const { profile, refresh } = useProfile()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const toast = useToast()
  const contacts = Array.isArray(profile?.emergencyContacts) ? profile.emergencyContacts : []
  const reachable = contacts.filter((c) => c.phone)
  const primary = reachable[0]
  // Contacts come from the profile — pull down to re-fetch them.
  const onPullRefresh = useCallback(async () => { await refresh() }, [refresh])
  const refreshControl = usePullRefresh(onPullRefresh)

  // Falls back to a "near me" search if location is refused (never a dead end).
  const findHospital = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') {
        toast.info('Location is off, so the map will search near you instead.')
        Linking.openURL(HOSPITALS_NEAR_ME)
        return
      }
      const pos = await Location.getCurrentPositionAsync({})
      const { latitude, longitude } = pos.coords
      Linking.openURL(`https://www.google.com/maps/search/hospitals/@${latitude},${longitude},14z`)
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
  const editContacts = () => navigation.navigate('ProfileContacts')

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Emergency" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle} accessibilityRole="header">In a medical emergency, call an ambulance now.</Text>
          <Text style={styles.heroText}>108 is free across India and connects you to the nearest ambulance.</Text>
          <TouchableOpacity style={styles.call108} onPress={() => Linking.openURL('tel:108')} accessibilityRole="button">
            <Ambulance size={18} color="#fff" /><Text style={styles.call108Text}>Call 108 — Ambulance</Text>
          </TouchableOpacity>
          <View style={styles.heroActions}>
            <TouchableOpacity style={[styles.action, !primary && styles.disabled]} disabled={!primary} onPress={shareLocation}>
              <MapPin size={15} color={colors.text} />
              <Text style={styles.actionText} numberOfLines={1}>{primary ? `Send my location to ${primary.name || 'my contact'}` : 'Share my location'}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.action} onPress={findHospital}>
              <Hospital size={15} color={colors.text} /><Text style={styles.actionText}>Nearby hospitals</Text>
            </TouchableOpacity>
          </View>
          {!primary && <Text style={styles.hint}>Add an emergency contact to share your location with them.</Text>}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Your emergency contacts</Text>
          {reachable.length === 0 ? (
            <View style={styles.empty}>
              <Text style={styles.emptyTitle}>No emergency contacts</Text>
              <Text style={styles.emptyText}>Add someone to call and share your location with in an emergency.</Text>
              <TouchableOpacity style={styles.ghostBtn} onPress={editContacts}><Pencil size={14} color={colors.text} /><Text style={styles.ghostText}>Add a contact</Text></TouchableOpacity>
            </View>
          ) : reachable.map((c, i) => (
            <View key={i} style={styles.row}>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{c.name || 'Emergency contact'}{c.relationship ? ` · ${c.relationship}` : ''}</Text>
                <Text style={styles.rowNum}>{c.phone}</Text>
              </View>
              <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${c.phone}`)} accessibilityLabel={`Call ${c.name || 'emergency contact'}`}>
                <Phone size={13} color="#fff" /><Text style={styles.callText}>Call</Text>
              </TouchableOpacity>
            </View>
          ))}
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Emergency numbers</Text>
          {NUMBERS.map(({ label, number, Icon }) => (
            <View key={number} style={styles.row}>
              <View style={styles.icon}><Icon size={16} color={colors.primary} /></View>
              <View style={{ flex: 1 }}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowNum}>{number}</Text></View>
              <TouchableOpacity style={styles.callGhost} onPress={() => Linking.openURL(`tel:${number}`)} accessibilityLabel={`Call ${label}, ${number}`}>
                <Phone size={14} color={colors.text} />
              </TouchableOpacity>
            </View>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 14 },
  hero: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 10 },
  heroTitle: { fontSize: 18, lineHeight: 24, fontWeight: '700', color: colors.text },
  heroText: { fontSize: 13.5, lineHeight: 19, color: colors.textSecondary },
  call108: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.sevEmergency, borderRadius: radius.md, paddingVertical: 14 },
  call108Text: { color: '#fff', fontWeight: '800', fontSize: 16 },
  heroActions: { gap: 8 },
  hint: { fontSize: 12, color: colors.muted },
  disabled: { opacity: 0.45 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopColor: colors.border, borderTopWidth: 1 },
  icon: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowNum: { fontSize: 12, color: colors.muted },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.sevEmergency, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11 },
  callText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  callGhost: { width: 38, height: 38, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  action: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, backgroundColor: colors.surface },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.text, flexShrink: 1 },
  empty: { alignItems: 'center', gap: 6, paddingVertical: 12 },
  emptyTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  emptyText: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
  ghostBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 14 },
  ghostText: { color: colors.text, fontWeight: '600' },
})
