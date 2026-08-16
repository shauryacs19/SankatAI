import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { HeartPulse, ShieldCheck } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { signUp, confirmSignUp, resendConfirmationCode, isCognitoConfigured } from '../lib/cognito'
import { useAuth } from '../context/AuthContext'

const empty = { email: '', password: '', confirmPassword: '', code: '' }

export default function LoginScreen({ route }) {
  const { signIn } = useAuth()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [mode, setMode] = useState(route.params?.mode === 'signup' ? 'signup' : 'signin')
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (v) => { setForm((p) => ({ ...p, [k]: v })); if (error) setError('') }
  const switchMode = (m) => { setMode(m); setError(''); setNotice('') }

  // AuthContext.signIn authenticates, resolves the landing route (App vs
  // ProfileSetup) and flips auth state — the navigator switches on its own.
  const doSignIn = async () => {
    setBusy(true); setError('')
    try { await signIn(form.email.trim(), form.password) }
    catch (e) { setError(e.message || 'Unable to sign in.'); setBusy(false) }
  }
  const doSignUp = async () => {
    setError('')
    if (form.password !== form.confirmPassword) return setError('Passwords do not match.')
    setBusy(true)
    try { await signUp(form.email.trim(), form.password); setNotice(`We sent a code to ${form.email.trim()}.`); setMode('confirm') }
    catch (e) { setError(e.message || 'Unable to create account.') } finally { setBusy(false) }
  }
  const doConfirm = async () => {
    setBusy(true); setError('')
    try { await confirmSignUp(form.email.trim(), form.code.trim()); setNotice('Account verified. You can now sign in.'); setForm({ ...empty, email: form.email }); setMode('signin') }
    catch (e) { setError(e.message || 'Invalid or expired code.') } finally { setBusy(false) }
  }
  const doResend = async () => {
    setError('')
    try { await resendConfirmationCode(form.email.trim()); setNotice('Code resent.') }
    catch (e) { setError(e.message || 'Unable to resend code.') }
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}><HeartPulse size={26} color={colors.primary} /></View>
          <Text style={styles.title}>{mode === 'confirm' ? 'Verify your email' : 'Welcome to Sankat.AI'}</Text>
          <Text style={styles.sub}>
            {mode === 'confirm' ? 'Enter the 6-digit code we emailed you.' : 'Sign in to sync your emergency profile, or create an account.'}
          </Text>
          <View style={styles.secured}><ShieldCheck size={13} color={colors.success} /><Text style={styles.securedText}>Secured by Amazon Cognito</Text></View>

          {!isCognitoConfigured() && <View style={styles.alertErr}><Text style={styles.alertErrText}>Cognito is not configured. Set EXPO_PUBLIC_COGNITO_* env vars.</Text></View>}
          {!!error && <View style={styles.alertErr}><Text style={styles.alertErrText}>{error}</Text></View>}
          {!!notice && !error && <View style={styles.alertOk}><Text style={styles.alertOkText}>{notice}</Text></View>}

          {mode !== 'confirm' && (
            <View style={styles.tabs}>
              <TouchableOpacity style={[styles.tab, mode === 'signin' && styles.tabActive]} onPress={() => switchMode('signin')}><Text style={[styles.tabText, mode === 'signin' && styles.tabTextActive]}>Sign In</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.tab, mode === 'signup' && styles.tabActive]} onPress={() => switchMode('signup')}><Text style={[styles.tabText, mode === 'signup' && styles.tabTextActive]}>Create Account</Text></TouchableOpacity>
            </View>
          )}

          {mode !== 'confirm' && (
            <>
              <Field label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
              <Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry placeholder="••••••••" />
            </>
          )}
          {mode === 'signup' && (
            <Field label="Confirm password" value={form.confirmPassword} onChangeText={set('confirmPassword')} secureTextEntry placeholder="••••••••" />
          )}
          {mode === 'confirm' && (
            <Field label="Verification code" value={form.code} onChangeText={set('code')} keyboardType="number-pad" placeholder="123456" />
          )}

          <TouchableOpacity style={styles.primaryBtn} disabled={busy} onPress={mode === 'signin' ? doSignIn : mode === 'signup' ? doSignUp : doConfirm}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{mode === 'signin' ? 'Sign In' : mode === 'signup' ? 'Create Account' : 'Verify Account'}</Text>}
          </TouchableOpacity>
          {mode === 'confirm' && <TouchableOpacity onPress={doResend} style={styles.resend}><Text style={styles.resendText}>Resend code</Text></TouchableOpacity>}
          {mode === 'confirm' && <TouchableOpacity onPress={() => switchMode('signin')} style={styles.back}><Text style={styles.backText}>← Back to sign in</Text></TouchableOpacity>}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Field({ label, ...props }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.muted} {...props} />
    </View>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  scroll: { padding: 24, paddingTop: 20 },
  brandRow: { alignItems: 'center', marginBottom: 12 },
  title: { fontSize: 24, fontWeight: '800', color: colors.text, textAlign: 'center' },
  sub: { color: colors.muted, textAlign: 'center', marginTop: 8, fontSize: 14, lineHeight: 20 },
  secured: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 12 },
  securedText: { color: colors.muted, fontSize: 12 },
  tabs: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.md, padding: 4, marginTop: 22 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontWeight: '600', color: colors.muted },
  tabTextActive: { color: colors.primary },
  field: { marginTop: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
  primaryBtnText: { color: '#fff', fontWeight: '700', fontSize: 16 },
  resend: { alignItems: 'center', marginTop: 14 },
  resendText: { color: colors.primary, fontWeight: '600' },
  back: { alignItems: 'center', marginTop: 20 },
  backText: { color: colors.muted },
  alertErr: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 16 },
  alertErrText: { color: colors.primary, fontSize: 13 },
  alertOk: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 16 },
  alertOkText: { color: colors.success, fontSize: 13 },
})
