import { useState } from 'react'
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { AlertCircle, HeartPulse, RefreshCw, ShieldCheck } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { useAuth } from '../context/AuthContext'

export default function ProfileCheckScreen({ navigation }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const { profileCheckError, retryProfileCheck, signOut } = useAuth()
  const [checking, setChecking] = useState(false)

  const retry = async () => {
    setChecking(true)
    const route = await retryProfileCheck()
    setChecking(false)
    if (route) navigation.reset({ index: 0, routes: [{ name: route }] })
  }

  return (
    <SafeAreaView style={styles.safe}>
      <View style={styles.content}>
        <View style={styles.brandMark}><HeartPulse size={24} color={colors.onPrimary} /></View>
        <Text style={styles.brand}>Sankat<Text style={{ color: colors.primary }}>.AI</Text></Text>
        <View style={styles.iconWrap}><ShieldCheck size={27} color={colors.primary} /></View>
        <Text style={styles.title}>Checking your health profile</Text>
        <Text style={styles.body}>We need to confirm your basic details before opening the app, so your health guidance is set up safely.</Text>

        <View style={styles.errorCard}>
          <AlertCircle size={18} color={colors.danger} />
          <Text style={styles.errorText}>{profileCheckError || 'We couldn’t verify your profile right now. Please try again.'}</Text>
        </View>

        <TouchableOpacity style={styles.primary} onPress={retry} disabled={checking} accessibilityRole="button">
          {checking ? <ActivityIndicator color={colors.onPrimary} /> : <RefreshCw size={17} color={colors.onPrimary} />}
          <Text style={styles.primaryText}>{checking ? 'Checking…' : 'Try again'}</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.signOut} onPress={signOut} disabled={checking} accessibilityRole="button">
          <Text style={styles.signOutText}>Sign out</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 26, paddingVertical: 32 },
  brandMark: { width: 48, height: 48, borderRadius: 16, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 10 },
  brand: { color: colors.text, fontSize: 20, fontWeight: '800', marginBottom: 36 },
  iconWrap: { width: 58, height: 58, borderRadius: 19, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center', marginBottom: 18 },
  title: { color: colors.text, fontSize: 24, fontWeight: '800', textAlign: 'center' },
  body: { color: colors.textSecondary, fontSize: 15, lineHeight: 22, textAlign: 'center', marginTop: 10, maxWidth: 360 },
  errorCard: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: radius.md, padding: 13, marginTop: 24, width: '100%', maxWidth: 420 },
  errorText: { color: colors.danger, fontSize: 13, lineHeight: 19, flex: 1 },
  primary: { width: '100%', maxWidth: 420, minHeight: 52, borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 9, marginTop: 18 },
  primaryText: { color: colors.onPrimary, fontSize: 15, fontWeight: '700' },
  signOut: { paddingHorizontal: 18, paddingVertical: 14, marginTop: 4 },
  signOutText: { color: colors.muted, fontSize: 14, fontWeight: '600' },
})
