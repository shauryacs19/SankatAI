import { useCallback, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Linking } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Ambulance, CheckCircle2, CloudOff, MessageSquare, RefreshCw, ShieldCheck } from 'lucide-react-native'
import { radius } from '../../theme'
import { useTheme } from '../../context/ThemeContext'
import { API_BASE_URL } from '../../config'
import { fetchWithTimeout } from '../../lib/api'
import ScreenHeader from '../../components/ScreenHeader'

export default function OfflineScreen({ navigation }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [status, setStatus] = useState('checking')
  const refresh = useCallback(async () => {
    setStatus('checking')
    try { const response = await fetchWithTimeout(`${API_BASE_URL}/api/health`, {}, 6000); setStatus(response.ok ? 'online' : 'offline') }
    catch { setStatus('offline') }
  }, [])
  useEffect(() => { refresh() }, [refresh])

  return (
    <SafeAreaView style={styles.safe} edges={navigation?.shellManaged ? [] : ['top']}>
      <ScreenHeader title="Service status" navigation={navigation} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={[styles.statusCard, status === 'offline' ? styles.statusWarning : styles.statusGood]}>
          {status === 'checking' ? <ActivityIndicator size="small" color={colors.primary} /> : status === 'offline' ? <CloudOff size={21} color={colors.warning} /> : <CheckCircle2 size={21} color={colors.success} />}
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{status === 'checking' ? 'Checking the AI service' : status === 'offline' ? 'The AI assistant is unavailable right now.' : 'The AI assistant is online'}</Text>
            <Text style={styles.body}>{status === 'offline' ? 'You can keep using SankatAI, but replies may be automatic keyword estimates.' : 'We’ll explain what changes here if the service becomes unavailable.'}</Text>
          </View>
          <TouchableOpacity onPress={refresh} accessibilityRole="button" accessibilityLabel="Check service status"><RefreshCw size={17} color={colors.textSecondary} /></TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>What changes in offline mode</Text>
          <View style={styles.bullet}><View style={styles.dot} /><Text style={styles.body}>Replies come from a simple keyword check, not the AI assistant.</Text></View>
          <View style={styles.bullet}><View style={styles.dot} /><Text style={styles.body}>Offline replies are labelled “Offline estimate — not an AI assessment”.</Text></View>
          <View style={styles.bullet}><View style={styles.dot} /><Text style={styles.body}>Your chats, documents and health profile still work when their services are available.</Text></View>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}><ShieldCheck size={17} color={colors.primary} /><Text style={styles.cardTitle}>Your safety comes first</Text></View>
          <Text style={styles.body}>SankatAI is not a substitute for professional medical care. If someone may be in immediate danger, call emergency services.</Text>
        </View>

        <TouchableOpacity style={styles.secondary} onPress={() => navigation.navigate('Chat')}>
          <MessageSquare size={16} color={colors.primary} /><Text style={styles.secondaryText}>Back to chat</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.emergency} onPress={() => Linking.openURL('tel:108')}>
          <Ambulance size={16} color="#fff" /><Text style={styles.emergencyText}>Emergency? Call 108</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 14 },
  statusCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 12, borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  statusWarning: { borderColor: colors.warningBorder, backgroundColor: colors.warningSoft },
  statusGood: { borderColor: colors.successBorder, backgroundColor: colors.successSoft },
  title: { color: colors.text, fontSize: 16, fontWeight: '700' },
  body: { color: colors.textSecondary, fontSize: 14, lineHeight: 21, marginTop: 5 },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16, gap: 10 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  cardTitle: { color: colors.text, fontSize: 15, fontWeight: '700' },
  bullet: { flexDirection: 'row', alignItems: 'flex-start', gap: 10 },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginTop: 11 },
  secondary: { minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.primaryBorder, borderRadius: radius.md, backgroundColor: colors.primarySoft },
  secondaryText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  emergency: { minHeight: 48, flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 8, borderRadius: radius.md, backgroundColor: colors.sevEmergency },
  emergencyText: { color: '#fff', fontWeight: '700', fontSize: 14 },
})
