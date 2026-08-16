import { useCallback } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Linking, Alert, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import * as Location from 'expo-location'
import { Phone, Ambulance, Siren, Shield, Flame, MapPin, User } from 'lucide-react-native'
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
  const primary = contacts.find((c) => c.phone) || contacts[0]
  // Contacts come from the profile — pull down to re-fetch them.
  const onPullRefresh = useCallback(async () => { await refresh() }, [refresh])
  const refreshControl = usePullRefresh(onPullRefresh)

  const findHospital = async () => {
    try {
      const { status } = await Location.requestForegroundPermissionsAsync()
      if (status !== 'granted') return Alert.alert('Location permission is needed to find hospitals.')
      const pos = await Location.getCurrentPositionAsync({})
      const { latitude, longitude } = pos.coords
      Linking.openURL(`https://www.google.com/maps/search/hospitals/@${latitude},${longitude},14z`)
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

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Emergency" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Emergency Numbers</Text>
          {NUMBERS.map(({ label, number, Icon }) => (
            <View key={number} style={styles.row}>
              <View style={styles.icon}><Icon size={16} color={colors.primary} /></View>
              <View style={{ flex: 1 }}><Text style={styles.rowLabel}>{label}</Text><Text style={styles.rowNum}>{number}</Text></View>
              <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${number}`)}><Phone size={13} color="#fff" /><Text style={styles.callText}>Call</Text></TouchableOpacity>
            </View>
          ))}
        </View>

        {contacts.length > 0 && (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Your Emergency Contacts</Text>
            {contacts.map((c, i) => (
              <View key={i} style={styles.row}>
                <View style={styles.icon}><User size={16} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowLabel}>{c.name || `Contact ${i + 1}`}</Text>
                  <Text style={styles.rowNum}>{[c.relationship, c.phone].filter(Boolean).join(' · ') || 'No number'}</Text>
                </View>
                {!!c.phone && <TouchableOpacity style={styles.callBtn} onPress={() => Linking.openURL(`tel:${c.phone}`)}><Phone size={13} color="#fff" /><Text style={styles.callText}>Call</Text></TouchableOpacity>}
              </View>
            ))}
          </View>
        )}

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Quick Actions</Text>
          <Action label="Call ambulance" danger onPress={() => Linking.openURL('tel:108')} Icon={Ambulance} />
          {!!primary?.phone && <Action label="Call emergency contact" onPress={() => Linking.openURL(`tel:${primary.phone}`)} Icon={Phone} />}
          {!!primary?.phone && <Action label="Share my location" onPress={shareLocation} Icon={MapPin} />}
          <Action label="Find nearby hospital" onPress={findHospital} Icon={MapPin} />
        </View>
      </ScrollView>
    </SafeAreaView>
  )
}

const Action = ({ label, danger, onPress, Icon }) => {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  return (
    <TouchableOpacity style={[styles.action, danger && styles.actionDanger]} onPress={onPress}>
      <Icon size={15} color={danger ? '#fff' : colors.text} />
      <Text style={[styles.actionText, danger && { color: '#fff' }]}>{label}</Text>
    </TouchableOpacity>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 14 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 9, borderTopColor: colors.border, borderTopWidth: 1 },
  icon: { width: 34, height: 34, borderRadius: 9, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowNum: { fontSize: 12, color: colors.muted },
  callBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: colors.sevEmergency, borderRadius: 8, paddingVertical: 7, paddingHorizontal: 11 },
  callText: { color: '#fff', fontWeight: '700', fontSize: 12 },
  action: { flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 14, marginTop: 8, backgroundColor: colors.surface },
  actionDanger: { backgroundColor: colors.sevEmergency, borderColor: colors.sevEmergency },
  actionText: { fontSize: 14, fontWeight: '600', color: colors.text },
})
