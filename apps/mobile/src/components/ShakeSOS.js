// Global foreground panic gesture. Three distinct accelerometer spikes open
// the emergency sheet; the user can prepare one group SOS SMS for all contacts.

import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet, Linking, Alert, ActivityIndicator, AppState, Platform, DevSettings } from 'react-native'
import { Accelerometer } from 'expo-sensors'
import * as Location from 'expo-location'
import { Siren, X, Ambulance, Users } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { useProfile } from '../context/ProfileContext'

// Detect a sharp change between consecutive gravity-inclusive samples. A
// magnitude-only threshold misses emulator pose rotations because gravity's
// magnitude stays close to 1 g while its direction changes.
const SHAKE_DELTA_G = 0.25
const SHAKE_MAGNITUDE_DIFF_G = 0.35
const NEEDED_SPIKES = 3
const WINDOW_MS = 2500
const SPIKE_GAP_MS = 140
const RETRIGGER_COOLDOWN_MS = 4000

const dialNumber = (value) => (value || '').replace(/[^\d+]/g, '')

async function getLocationLink() {
  let permission = await Location.getForegroundPermissionsAsync()
  if (permission.status !== 'granted') {
    permission = await Location.requestForegroundPermissionsAsync()
  }
  if (permission.status !== 'granted') return ''

  // A recent reading keeps the SOS flow responsive. A fresh reading is used
  // only if there is no accurate cached position. The call still proceeds if
  // location is unavailable.
  const recent = await Location.getLastKnownPositionAsync({
    maxAge: 60_000,
    requiredAccuracy: 1_000,
  })
  const position = recent || await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  })
  return `https://maps.google.com/?q=${position.coords.latitude},${position.coords.longitude}`
}

export default function ShakeSOS() {
  const { profile } = useProfile()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [open, setOpen] = useState(false)
  const [busyPhone, setBusyPhone] = useState(null)
  const contacts = (Array.isArray(profile?.emergencyContacts) ? profile.emergencyContacts : []).filter((contact) => contact?.phone)

  const spikes = useRef([])
  const lastReading = useRef(null)
  const lastTrigger = useRef(0)
  const openRef = useRef(false)
  const appState = useRef(AppState.currentState)

  useEffect(() => {
    if (__DEV__ && DevSettings && typeof DevSettings.addMenuItem === 'function') {
      try {
        DevSettings.addMenuItem('Trigger Emergency SOS (Shake)', () => {
          setOpen(true)
        })
      } catch {
        // DevSettings helper optional
      }
    }
  }, [])

  useEffect(() => { openRef.current = open }, [open])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appState.current = nextState
      if (nextState !== 'active') spikes.current = []
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    Accelerometer.setUpdateInterval(60)
    const subscription = Accelerometer.addListener(({ x, y, z }) => {

      if (appState.current === 'background' || appState.current === 'inactive') return

      const previous = lastReading.current
      lastReading.current = { x, y, z }
      if (!previous) return
      const delta = Math.sqrt((x - previous.x) ** 2 + (y - previous.y) ** 2 + (z - previous.z) ** 2)
      const magnitude = Math.sqrt(x ** 2 + y ** 2 + z ** 2)
      const magDiff = Math.abs(magnitude - 1.0)
      if (delta < SHAKE_DELTA_G && magDiff < SHAKE_MAGNITUDE_DIFF_G) return

      const now = Date.now()
      const previousSpike = spikes.current[spikes.current.length - 1] || 0
      if (now - previousSpike < SPIKE_GAP_MS) return

      spikes.current.push(now)
      spikes.current = spikes.current.filter((timestamp) => now - timestamp <= WINDOW_MS)

      if (spikes.current.length >= NEEDED_SPIKES && !openRef.current && now - lastTrigger.current > RETRIGGER_COOLDOWN_MS) {

        spikes.current = []
        lastTrigger.current = now
        setOpen(true)
      }
    })
    return () => subscription.remove()
  }, [])

  const sendSos = async () => {
    if (busyPhone) return

    const recipients = contacts.map((contact) => dialNumber(contact.phone)).filter((phone) => phone.length >= 8)
    if (!recipients.length) {
      Alert.alert('No emergency contacts saved', 'Call 108 now, or add trusted contacts in your profile so they can receive your SOS.')
      return
    }

    setBusyPhone('all')
    let locationLink = ''
    try {
      locationLink = await getLocationLink()
    } catch {
      // The emergency call remains available if GPS, network, or permissions fail.
    }

    const message = `SOS: I need help.${locationLink ? ` My current location: ${locationLink}` : ' I could not get my location. Please call me.'}`
    const recipientList = recipients.join(Platform.OS === 'ios' ? ',' : ';')
    const separator = Platform.OS === 'ios' ? '&' : '?'
    const scheme = Platform.OS === 'ios' ? 'sms' : 'smsto'
    const smsUrl = `${scheme}:${recipientList}${separator}body=${encodeURIComponent(message)}`

    try {
      await Linking.openURL(smsUrl)
    } catch {
      Alert.alert('Could not open your messaging app', 'Call 108 for urgent help. You can also copy the SOS message and contact your trusted people.')
    }

    setOpen(false)
    setBusyPhone(null)
  }

  const callAmbulance = () => {
    setOpen(false)
    Linking.openURL('tel:108').catch(() => Alert.alert('Could not start the call.'))
  }

  return (
    <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <View style={styles.head}>
            <View style={styles.headLeft}>
              <View style={styles.sirenBadge}><Siren size={18} color="#fff" /></View>
              <Text style={styles.title}>Emergency SOS</Text>
            </View>
            <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10} accessibilityLabel="Close emergency SOS"><X size={20} color={colors.muted} /></TouchableOpacity>
          </View>
          <Text style={styles.sub}>Three quick shakes opened this alert. Prepare one SOS text for all your saved emergency contacts with your current location.</Text>

          <TouchableOpacity style={styles.ambulance} onPress={callAmbulance} activeOpacity={0.85} accessibilityLabel="Call ambulance on 108">
            <Ambulance size={18} color="#fff" /><Text style={styles.ambulanceText}>Call Ambulance - 108</Text>
          </TouchableOpacity>

          {contacts.length > 0 ? (
            <>
              <TouchableOpacity style={styles.sendAll} onPress={sendSos} disabled={Boolean(busyPhone)} activeOpacity={0.85} accessibilityRole="button" accessibilityLabel={`Prepare SOS message for ${contacts.length} emergency contacts`}>
                {busyPhone ? <ActivityIndicator color="#fff" /> : <><Users size={18} color="#fff" /><Text style={styles.sendAllText}>Prepare SOS for all {contacts.length} contacts</Text></>}
              </TouchableOpacity>
              <View style={styles.contactList}>
                {contacts.map((contact, index) => (
                  <View key={`${contact.phone}-${index}`} style={styles.contact}>
                    <Text style={styles.contactName} numberOfLines={1}>{contact.name || `Emergency contact ${index + 1}`}</Text>
                    <Text style={styles.contactMeta} numberOfLines={1}>{contact.phone}</Text>
                  </View>
                ))}
              </View>
            </>
          ) : <Text style={styles.noContacts}>No trusted contacts saved yet. You can still call 108 above.</Text>}

          <Text style={styles.foot}>Your messaging app opens with the recipients and location message filled in. Tap Send there to confirm delivery. Location access is requested only when you choose SOS.</Text>
        </View>
      </View>
    </Modal>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.55)', alignItems: 'center', justifyContent: 'center', padding: 22 },
  card: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.xl, padding: 18, borderColor: colors.primaryBorder, borderWidth: 1 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sirenBadge: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.sevEmergency, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 18, fontWeight: '800', color: colors.text },
  sub: { color: colors.muted, fontSize: 13, lineHeight: 18, marginTop: 10 },
  ambulance: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.sevEmergency, borderRadius: radius.md, paddingVertical: 13, marginTop: 14 },
  ambulanceText: { color: '#fff', fontWeight: '800', fontSize: 15 },
  sendAll: { minHeight: 50, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, marginTop: 12 },
  sendAllText: { color: '#fff', fontWeight: '800', fontSize: 14, textAlign: 'center' },
  contactList: { gap: 10, marginTop: 12 },
  contact: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: 10, backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md },
  contactName: { fontSize: 15, fontWeight: '700', color: colors.text },
  contactMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  noContacts: { color: colors.muted, fontSize: 13, lineHeight: 19, marginTop: 14, textAlign: 'center' },
  foot: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 16 },
})
