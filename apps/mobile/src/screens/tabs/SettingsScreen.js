import { useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Pencil, MessageSquare, Activity, Palette, Sun, Moon, Smartphone } from 'lucide-react-native'
import { radius } from '../../theme'
import { useProfile } from '../../context/ProfileContext'
import { useTheme } from '../../context/ThemeContext'
import { fetchWithTimeout } from '../../lib/api'
import { API_BASE_URL } from '../../config'
import ScreenHeader from '../../components/ScreenHeader'
import AuthSection from '../../components/AuthSection'

const THEMES = [
  { key: 'light', label: 'Light', Icon: Sun },
  { key: 'dark', label: 'Dark', Icon: Moon },
  { key: 'system', label: 'System', Icon: Smartphone },
]

export default function SettingsScreen({ navigation }) {
  const { profile } = useProfile()
  const { colors, pref, setPref } = useTheme()
  const styles = makeStyles(colors)
  const [isOffline, setIsOffline] = useState(false)

  useEffect(() => {
    fetchWithTimeout(`${API_BASE_URL}/api/health`, {}, 6000).then((r) => setIsOffline(!r.ok)).catch(() => setIsOffline(true))
  }, [])


  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="Settings" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.card}>
          <View style={styles.statusTitle}><Palette size={14} color={colors.primary} /><Text style={styles.cardTitle}>Appearance</Text></View>
          <View style={styles.themeRow}>
            {THEMES.map(({ key, label, Icon }) => {
              const on = pref === key
              return (
                <TouchableOpacity key={key} style={[styles.themeBtn, on && styles.themeBtnOn]} onPress={() => setPref(key)} activeOpacity={0.8}>
                  <Icon size={18} color={on ? colors.primary : colors.textSecondary} />
                  <Text style={[styles.themeText, on && { color: colors.primary }]}>{label}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Account</Text>
          <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('ProfileSetup')}><Pencil size={16} color={colors.textSecondary} /><Text style={styles.itemText}>Edit profile</Text></TouchableOpacity>
          <TouchableOpacity style={styles.item} onPress={() => navigation.navigate('Chat')}><MessageSquare size={16} color={colors.textSecondary} /><Text style={styles.itemText}>Go to chat</Text></TouchableOpacity>
        </View>

        <AuthSection />

        <View style={styles.card}>
          <View style={styles.statusTitle}><Activity size={14} color={colors.primary} /><Text style={styles.cardTitle}>Status</Text></View>
          <View style={styles.row}><Text style={styles.rowLabel}>AI service</Text><Text style={styles.rowValue}>{isOffline ? 'Offline (backup mode)' : 'Online'}</Text></View>
          <View style={styles.row}><Text style={styles.rowLabel}>Signed in as</Text><Text style={styles.rowValue}>{profile?.email || '—'}</Text></View>
        </View>

        <Text style={styles.footer}>Sankat.AI · Not a substitute for professional medical care.</Text>
      </ScrollView>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 16, gap: 14 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 8 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5, padding: 10 },
  statusTitle: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingLeft: 4 },
  themeRow: { flexDirection: 'row', gap: 10, padding: 10, paddingTop: 0 },
  themeBtn: { flex: 1, alignItems: 'center', gap: 6, paddingVertical: 14, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.bg },
  themeBtnOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  themeText: { fontSize: 13, fontWeight: '700', color: colors.textSecondary },
  item: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: radius.md },
  itemText: { fontSize: 15, fontWeight: '500', color: colors.textSecondary },
  row: { flexDirection: 'row', justifyContent: 'space-between', padding: 12 },
  rowLabel: { color: colors.muted, fontSize: 14 },
  rowValue: { color: colors.text, fontSize: 14, fontWeight: '600' },
  footer: { color: colors.muted, fontSize: 12, textAlign: 'center', marginTop: 20 },
})
