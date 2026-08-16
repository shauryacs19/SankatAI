import { useCallback, useEffect, useMemo, useState } from 'react'
import { View, Text, ScrollView, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { BadgeCheck, Droplet, User, Stethoscope, Phone, ChevronRight, AlertTriangle, Pencil } from 'lucide-react-native'
import { radius } from '../../theme'
import { useTheme } from '../../context/ThemeContext'
import { useProfile } from '../../context/ProfileContext'
import SecurityPins from '../../components/SecurityPins'
import ScreenHeader from '../../components/ScreenHeader'
import usePullRefresh from '../../components/usePullRefresh'
import { ageFromDob } from '../../lib/profileOptions'

const orDash = (v) => (String(v || '').trim() ? v : '—')

export default function ProfileScreen({ navigation }) {
  const { profile, loading, refresh } = useProfile()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [failed, setFailed] = useState(false)

  const reload = useCallback(async () => {
    setFailed(false)
    const p = await refresh()
    if (!p) setFailed(true) // null can mean "no profile yet" or a fetch error; surface retry either way
  }, [refresh])
  useEffect(() => { reload() }, [reload])
  const refreshControl = usePullRefresh(reload)

  const fullName = [profile?.firstName, profile?.middleName, profile?.lastName].filter(Boolean).join(' ') || 'Your profile'
  const age = ageFromDob(profile?.dob)
  const contacts = Array.isArray(profile?.emergencyContacts) ? profile.emergencyContacts : []

  const completion = useMemo(() => {
    if (!profile) return 0
    const f = ['firstName', 'lastName', 'dob', 'gender', 'bloodGroup', 'phone', 'email', 'allergies', 'conditions', 'disability', 'preferredLanguage']
    let n = f.filter((k) => String(profile[k] || '').trim()).length
    if (contacts.some((c) => c.phone || c.name)) n++
    return Math.round((n / (f.length + 1)) * 100)
  }, [profile, contacts])

  const sections = [
    { key: 'ProfilePersonal', Icon: User, title: 'Personal information', subtitle: [orDash(profile?.firstName && fullName), age != null ? `${age} yrs` : null, profile?.phone].filter(Boolean).join(' · ') || 'Name, DOB, contact details' },
    { key: 'ProfileMedical', Icon: Stethoscope, title: 'Medical information', subtitle: [profile?.bloodGroup && `Blood ${profile.bloodGroup}`, profile?.allergies && 'Allergies', profile?.conditions && 'Conditions'].filter(Boolean).join(' · ') || 'Blood group, allergies, conditions, insurance' },
    { key: 'ProfileContacts', Icon: Phone, title: 'Emergency contacts', subtitle: contacts.length ? `${contacts.length} contact${contacts.length > 1 ? 's' : ''}` : 'None added yet' },
  ]

  const body = () => {
    if (loading && !profile) return <View style={styles.center}><ActivityIndicator color={colors.primary} /></View>
    if (failed && !profile) {
      return (
        <View style={styles.empty}>
          <AlertTriangle size={30} color={colors.muted} />
          <Text style={styles.emptyText}>We couldn't load your profile.</Text>
          <TouchableOpacity style={styles.emptyBtn} onPress={reload}><Text style={styles.emptyBtnText}>Retry</Text></TouchableOpacity>
          <TouchableOpacity style={[styles.emptyBtn, styles.emptyBtnGhost]} onPress={() => navigation.navigate('ProfileSetup')}><Text style={styles.emptyBtnGhostText}>Complete profile setup</Text></TouchableOpacity>
        </View>
      )
    }
    return (
      <>
        <View style={styles.card}>
          <View style={styles.head}>
            <View style={styles.avatar}><Text style={styles.avatarText}>{(profile?.firstName?.[0] || 'U').toUpperCase()}</Text></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{fullName}</Text>
              <View style={styles.verified}><BadgeCheck size={13} color={colors.success} /><Text style={styles.verifiedText}>Verified</Text></View>
            </View>
            {!!profile?.bloodGroup && <View style={styles.blood}><Droplet size={12} color={colors.primary} /><Text style={styles.bloodText}>{profile.bloodGroup}</Text></View>}
          </View>
          <View style={styles.compTop}><Text style={styles.compLabel}>Profile completion</Text><Text style={styles.compLabel}>{completion}%</Text></View>
          <View style={styles.bar}><View style={[styles.barFill, { width: `${completion}%` }]} /></View>
        </View>

        {sections.map((s) => (
          <TouchableOpacity key={s.key} style={styles.sectionRow} onPress={() => navigation.navigate(s.key)} activeOpacity={0.7}>
            <View style={styles.sectionIcon}><s.Icon size={20} color={colors.primary} /></View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sectionTitle}>{s.title}</Text>
              <Text style={styles.sectionSub} numberOfLines={1}>{s.subtitle}</Text>
            </View>
            <ChevronRight size={20} color={colors.muted} />
          </TouchableOpacity>
        ))}

        <TouchableOpacity style={styles.fullEdit} onPress={() => navigation.navigate('ProfileSetup')}>
          <Pencil size={14} color={colors.primary} /><Text style={styles.fullEditText}>Edit full profile</Text>
        </TouchableOpacity>

        <SecurityPins />
      </>
    )
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Profile" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>{body()}</ScrollView>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 12 },
  center: { paddingVertical: 60, alignItems: 'center' },
  empty: { alignItems: 'center', gap: 12, paddingVertical: 50 },
  emptyText: { color: colors.muted, fontSize: 14 },
  emptyBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 22 },
  emptyBtnText: { color: '#fff', fontWeight: '700' },
  emptyBtnGhost: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1 },
  emptyBtnGhostText: { color: colors.textSecondary, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  head: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  avatar: { width: 54, height: 54, borderRadius: 15, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  avatarText: { color: '#fff', fontSize: 22, fontWeight: '800' },
  name: { fontSize: 17, fontWeight: '700', color: colors.text },
  verified: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 },
  verifiedText: { color: colors.success, fontSize: 12, fontWeight: '600' },
  blood: { flexDirection: 'row', alignItems: 'center', gap: 3, backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: 8, paddingVertical: 5, paddingHorizontal: 9 },
  bloodText: { color: colors.primary, fontWeight: '700', fontSize: 13 },
  compTop: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 16, marginBottom: 6 },
  compLabel: { fontSize: 12, fontWeight: '600', color: colors.muted },
  bar: { height: 6, backgroundColor: colors.surface2, borderRadius: 99, overflow: 'hidden' },
  barFill: { height: '100%', backgroundColor: colors.primary, borderRadius: 99 },
  sectionRow: { flexDirection: 'row', alignItems: 'center', gap: 14, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  sectionIcon: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  sectionSub: { fontSize: 12, color: colors.muted, marginTop: 3 },
  fullEdit: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 8 },
  fullEditText: { color: colors.primary, fontWeight: '600' },
})
