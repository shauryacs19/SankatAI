// Global panic gesture: shake the phone aggressively to open saved emergency
// contacts. Choosing a contact prepares a WhatsApp location message, then opens
// the phone dialler. WhatsApp deliberately requires the user to tap Send.

import { useEffect, useRef, useState } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet, Linking, Alert, ActivityIndicator, AppState } from 'react-native'
import { Accelerometer } from 'expo-sensors'
import * as Location from 'expo-location'
import { Siren, Phone, X, MapPin, Ambulance, User } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { useProfile } from '../context/ProfileContext'

const SHAKE_G = 1.8
const NEEDED_SPIKES = 3
const WINDOW_MS = 1200
const SPIKE_GAP_MS = 180
const RETRIGGER_COOLDOWN_MS = 4000

const waNumber = (value) => (value || '').replace(/[^\d]/g, '')
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
  const lastTrigger = useRef(0)
  const openRef = useRef(false)
  const appState = useRef(AppState.currentState)

  useEffect(() => { openRef.current = open }, [open])

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      appState.current = nextState
      if (nextState !== 'active') spikes.current = []
    })
    return () => subscription.remove()
  }, [])

  useEffect(() => {
    // Do not run an always-on sensor when there is no usable emergency contact.
    if (contacts.length === 0) return undefined

    Accelerometer.setUpdateInterval(90)
    const subscription = Accelerometer.addListener(({ x, y, z }) => {
      if (appState.current !== 'active') return

      const magnitude = Math.sqrt(x * x + y * y + z * z)
      if (magnitude < SHAKE_G) return

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
  }, [contacts.length])

  const triggerContact = async (contact) => {
    if (busyPhone) return

    const phone = dialNumber(contact.phone)
    const whatsappPhone = waNumber(contact.phone)
    if (!phone || whatsappPhone.length < 8) {
      Alert.alert('Check this contact number', 'Save the contact number with its country code, for example +91..., before using SOS.')
      return
    }

    setBusyPhone(phone)
    let locationLink = ''
    try {
      locationLink = await getLocationLink()
    } catch {
      // The emergency call remains available if GPS, network, or permissions fail.
    }

    const message = `EMERGENCY - I need help.${locationLink ? ` My current location: ${locationLink}` : ' I could not get my location. Please call me.'}`
    const whatsappAppUrl = `whatsapp://send?phone=${whatsappPhone}&text=${encodeURIComponent(message)}`
    const whatsappWebUrl = `https://wa.me/${whatsappPhone}?text=${encodeURIComponent(message)}`

    try {
      const hasWhatsapp = await Linking.canOpenURL(whatsappAppUrl)
      await Linking.openURL(hasWhatsapp ? whatsappAppUrl : whatsappWebUrl)
    } catch {
      // A WhatsApp failure must not stop the phone call.
    }

    setOpen(false)
    setBusyPhone(null)
    // A device can foreground only one external application at a time. The
    // dialler follows the WhatsApp composer so the contact can be called even
    // when WhatsApp is unavailable.
    setTimeout(() => {
      Linking.openURL(`tel:${phone}`).catch(() => Alert.alert('Could not start the call.'))
    }, 900)
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
          <Text style={styles.sub}>Tap a contact to prepare a WhatsApp location message, then open their phone call.</Text>

          <TouchableOpacity style={styles.ambulance} onPress={callAmbulance} activeOpacity={0.85} accessibilityLabel="Call ambulance on 108">
            <Ambulance size={18} color="#fff" /><Text style={styles.ambulanceText}>Call Ambulance - 108</Text>
          </TouchableOpacity>

          <View style={styles.contactList}>
            {contacts.map((contact, index) => {
              const busy = busyPhone === dialNumber(contact.phone)
              return (
                <TouchableOpacity key={`${contact.phone}-${index}`} style={styles.contact} onPress={() => triggerContact(contact)} disabled={Boolean(busyPhone)} activeOpacity={0.85} accessibilityLabel={`Contact ${contact.name || 'emergency contact'}`}>
                  <View style={styles.avatar}><User size={18} color={colors.primary} /></View>
                  <View style={styles.contactDetails}>
                    <Text style={styles.contactName} numberOfLines={1}>{contact.name || 'Emergency contact'}</Text>
                    <Text style={styles.contactMeta} numberOfLines={1}>{[contact.relationship, contact.phone].filter(Boolean).join(' - ')}</Text>
                  </View>
                  {busy ? <ActivityIndicator color={colors.primary} /> : (
                    <View style={styles.actions}><MapPin size={16} color={colors.muted} /><View style={styles.callDot}><Phone size={15} color="#fff" /></View></View>
                  )}
                </TouchableOpacity>
              )
            })}
          </View>

          <Text style={styles.foot}>WhatsApp requires you to tap Send. Triggered by shaking your phone.</Text>
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
  contactList: { gap: 10, marginTop: 12 },
  contact: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, backgroundColor: colors.bg, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md },
  avatar: { width: 40, height: 40, borderRadius: 11, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  contactDetails: { flex: 1 },
  contactName: { fontSize: 15, fontWeight: '700', color: colors.text },
  contactMeta: { fontSize: 12, color: colors.muted, marginTop: 2 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  callDot: { width: 34, height: 34, borderRadius: 17, backgroundColor: colors.success, alignItems: 'center', justifyContent: 'center' },
  foot: { color: colors.muted, fontSize: 11, textAlign: 'center', marginTop: 16 },
})
