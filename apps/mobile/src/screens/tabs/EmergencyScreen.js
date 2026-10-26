import { useCallback } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking, Alert, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import { Phone, Ambulance, Siren, Shield, Flame, MapPin, User, Hospital, Pencil, Plus } from 'lucide-react-native'
import { radius } from '../../theme'
import { useProfile } from '../../context/ProfileContext'
import { useTheme } from '../../context/ThemeContext'
import ScreenHeader from '../../components/ScreenHeader'
import usePullRefresh from '../../components/usePullRefresh'

const NUMBERS = [
  { label: 'Ambulance', number: '108', Icon: Ambulance },
  { label: 'Emergency (All)', number: '112', Icon: Siren },
  { label: 'Police', number: '100', Icon: Shield },
  { label: 'Fire', number: '101', Icon: Flame },
]

export default function EmergencyScreen({ navigation }) {
  const { profile, refresh } = useProfile()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const contacts = Array.isArray(profile?.emergencyContacts) ? profile.emergencyContacts : []
  const reachable = contacts.filter((c) => c.phone)
  const primary = reachable[0] || null
  // Contacts come from the profile — pull down to re-fetch them.
  const onPullRefresh = useCallback(async () => { await refresh() }, [refresh])
  const refreshControl = usePullRefresh(onPullRefresh)

  const findHospital = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return Alert.alert('Location permission is needed to find hospitals.')
      const pos = await Location.getCurrentPositionAsync({})
      const { latitude, longitude } = pos.coords
      await Linking.openURL(`https://www.google.com/maps/search/hospitals/@${latitude},${longitude},14z`)
    } catch { Alert.alert('Could not get your location.') }
  }
  const callNumber = async (number) => {
    try { await Linking.openURL(`tel:${number}`) }
    catch { Alert.alert('Could not start the call', 'Please dial the number manually if you need urgent help.') }
  }
  const shareLocation = async () => {
    if (!primary?.phone) return
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return Alert.alert('Location permission needed', 'Allow location access to share your location with your emergency contact.')
      const pos = await Location.getCurrentPositionAsync({})
      const link = `https://www.google.com/maps?q=${pos.coords.latitude},${pos.coords.longitude}`
      const sep = Platform.OS === 'ios' ? '&' : '?'
      await Linking.openURL(`sms:${primary.phone}${sep}body=${encodeURIComponent(`Medical Emergency! My location: ${link}`)}`)
    } catch { Alert.alert('Could not share your location', 'Please try again or call 108 if this is urgent.') }
  }

  const manageContacts = () => navigation?.navigate?.('ProfileContacts')

  return (
    <SafeAreaView style={styles.safe} edges={navigation?.shellManaged ? [] : ['top']}>
      <ScreenHeader title="Emergency" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
        <View style={styles.hero}>
          <Text style={styles.heroTitle}>In a medical emergency, call an ambulance now.</Text>
          <Text style={styles.heroText}>108 is free across India and connects you to the nearest ambulance.</Text>
          <TouchableOpacity style={styles.primaryCall} onPress={() => callNumber('108')} accessibilityRole="button" accessibilityLabel="Call 108 ambulance">
            <Ambulance size={18} color="#fff" /><Text style={styles.primaryCallText}>Call 108 — Ambulance</Text>
          </TouchableOpacity>
          <View style={styles.heroActions}>
            <TouchableOpacity style={[styles.secondaryAction, !primary?.phone && styles.disabledAction]} onPress={shareLocation} disabled={!primary?.phone} accessibilityRole="button" accessibilityHint={!primary?.phone ? 'Add an emergency contact first' : undefined}>
              <MapPin size={16} color={colors.textSecondary} /><Text style={styles.secondaryActionText}>Share my location</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryAction} onPress={findHospital} accessibilityRole="button">
              <Hospital size={16} color={colors.textSecondary} /><Text style={styles.secondaryActionText}>Nearby hospitals</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.card}>
          <View style={styles.sectionHead}>
            <Text style={styles.cardTitle}>Your emergency contacts</Text>
            <TouchableOpacity style={styles.manageButton} onPress={manageContacts} accessibilityRole="button">
              {reachable.length ? <Pencil size={14} color={colors.primary} /> : <Plus size={15} color={colors.primary} />}
              <Text style={styles.manageText}>{reachable.length ? 'Manage' : 'Add contact'}</Text>
            </TouchableOpacity>
          </View>
          {reachable.length > 0 ? reachable.map((c, i) => (
            <View key={`${c.phone}-${i}`} style={styles.row}>
              <View style={styles.icon}><User size={16} color={colors.primary} /></View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowLabel} numberOfLines={1}>{c.name || `Contact ${i + 1}`}</Text>
                <Text style={styles.rowNum} numberOfLines={1}>{[c.relationship, c.phone].filter(Boolean).join(' · ')}</Text>
              </View>
              <TouchableOpacity style={styles.callBtn} onPress={() => callNumber(c.phone)} accessibilityRole="button" accessibilityLabel={`Call ${c.name || 'emergency contact'}`}><Phone size={13} color="#fff" /><Text style={styles.callText}>Call</Text></TouchableOpacity>
            </View>
          )) : (
            <View style={styles.emptyContacts}>
              <User size={20} color={colors.muted} />
              <Text style={styles.emptyText}>Add someone you trust so they’re easy to reach in an emergency.</Text>
              <TouchableOpacity style={styles.addContact} onPress={manageContacts} accessibilityRole="button"><Plus size={15} color={colors.primary} /><Text style={styles.addContactText}>Add a contact</Text></TouchableOpacity>
            </View>
          )}
        </View>

        <View style={styles.card}>
          <Text style={[styles.cardTitle, styles.numbersTitle]}>Emergency numbers</Text>
          {NUMBERS.map(({ label, number, Icon }) => (
            <View key={number} style={styles.row}>
              <View style={styles.icon}><Icon size={16} color={colors.primary} /></View>
              <View style={{ flex: 1 }}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowNum}>{number}</Text></View>
              <TouchableOpacity style={styles.callBtn} onPress={() => callNumber(number)}><Phone size={13} color="#fff" /><Text style={styles.callText}>Call</Text></TouchableOpacity>
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
  hero: { gap: 12, padding: 16, borderWidth: 1, borderColor: colors.dangerBorder, borderRadius: radius.lg, backgroundColor: colors.dangerSoft },
  heroTitle: { color: colors.sevEmergency, fontSize: 19, lineHeight: 26, fontWeight: '700' },
  heroText: { color: colors.textSecondary, fontSize: 14, lineHeight: 21 },
  primaryCall: { minHeight: 52, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, borderRadius: radius.md, backgroundColor: colors.sevEmergency },
  primaryCallText: { color: '#fff', fontSize: 15, fontWeight: '700' },
  heroActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 9 },
  secondaryAction: { flex: 1, minWidth: 135, minHeight: 46, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, backgroundColor: colors.surface },
  disabledAction: { opacity: 0.5 },
  secondaryActionText: { color: colors.textSecondary, fontSize: 12.5, fontWeight: '600' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 },
  cardTitle: { flex: 1, fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 0 },
  numbersTitle: { marginBottom: 10 },
  manageButton: { minHeight: 34, flexDirection: 'row', alignItems: 'center', gap: 5, paddingHorizontal: 9, borderWidth: 1, borderColor: colors.primaryBorder, borderRadius: 9, backgroundColor: colors.primarySoft },
  manageText: { color: colors.primary, fontSize: 12, fontWeight: '700' },
  emptyContacts: { alignItems: 'center', gap: 9, paddingVertical: 16 },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  addContact: { minHeight: 38, flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, borderWidth: 1, borderColor: colors.border, borderRadius: 9, backgroundColor: colors.surface },
  addContactText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopColor: colors.border, borderTopWidth: 1 },
  icon: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowNum: { fontSize: 12, color: colors.muted },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.sevEmergency, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11 },
  callText: { color: '#fff', fontWeight: '700', fontSize: 12 },
})
