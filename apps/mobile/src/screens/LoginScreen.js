import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { HeartPulse, ShieldCheck } from 'lucide-react-native'
import { isEmail, maskPhone, parseIdentifier, preSignUpMessage, toE164, usernameError } from '@sankatai/shared'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import {
  signUp, confirmSignUp, resendConfirmationCode, isCognitoConfigured,
  startCodeSignIn, confirmCodeSignIn, cancelCodeSignIn, socialProviders, signInWithProvider,
} from '../lib/cognito'
import { useAuth } from '../context/AuthContext'

const empty = { identifier: '', username: '', name: '', email: '', phone: '', password: '', confirmPassword: '', code: '' }

// Cognito error -> message. Wrong credentials and unknown accounts share one.
const friendly = (e, fallback) => {
  const code = e?.code || e?.name
  if (code === 'NotAuthorizedException' || code === 'UserNotFoundException') return 'Those sign-in details don’t match an account.'
  if (code === 'UsernameExistsException' || code === 'AliasExistsException') return 'That username, email or phone number is already in use.'
  if (code === 'UserLambdaValidationException') return preSignUpMessage(e) || fallback
  if (code === 'CodeMismatchException') return 'That code is incorrect. Check the latest message and try again.'
  if (code === 'ExpiredCodeException') return 'That code has expired. Request a new one.'
  if (code === 'SmsSignInUnavailable') return 'Text-message sign-in isn’t available for this number. Sign in with your password.'
  if (code === 'LimitExceededException' || code === 'TooManyRequestsException') return 'Too many attempts. Wait a few minutes, then try again.'
  if (code === 'InvalidPasswordException') return 'Use 8+ characters with an uppercase letter, a lowercase letter and a number.'
  return e?.message || fallback
}

export default function LoginScreen({ route }) {
  const { signIn, finishSignIn } = useAuth()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [mode, setMode] = useState(route.params?.mode === 'signup' ? 'signup' : 'signin') // signin | signup | confirm | code
  const [method, setMethod] = useState('password') // password | code (sign-in)
  const [via, setVia] = useState('email') // email | phone (sign-up)
  const [pending, setPending] = useState(null) // { username (Cognito UUID), destination, via, handle }
  const [sentTo, setSentTo] = useState('')
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  const providers = socialProviders()

  const set = (k) => (v) => { setForm((p) => ({ ...p, [k]: v })); if (error) setError('') }
  const switchMode = (m) => { setMode(m); setError(''); setNotice('') }
  const run = async (fn, fallback) => {
    setBusy(true); setError('')
    try { await fn() } catch (e) { setError(friendly(e, fallback)) } finally { setBusy(false) }
  }

  // AuthContext.signIn authenticates, resolves the landing route (App vs
  // ProfileSetup) and flips auth state — the navigator switches on its own.
  const doSignIn = () => {
    const id = parseIdentifier(form.identifier)
    if (!id) return setError('Enter your username, email or phone number (with country code, or 10 digits).')
    if (!form.password) return setError('Enter your password.')
    return run(() => signIn(id.value, form.password), 'Unable to sign in.')
  }
  const doSendCode = () => {
    const phone = toE164(form.phone)
    if (!phone) return setError('Enter a valid phone number, like 98765 43210 or +91 98765 43210.')
    return run(async () => {
      const { destination } = await startCodeSignIn(phone)
      setSentTo(destination || maskPhone(phone))
      setForm((p) => ({ ...p, code: '' }))
      setMode('code')
    }, 'Unable to send a code.')
  }
  const doCodeSignIn = () => {
    if (form.code.trim().length !== 6) return setError('Enter the 6-digit code.')
    return run(async () => { await confirmCodeSignIn(form.code.trim()); await finishSignIn() }, 'Unable to sign in.')
  }
  const doSocial = (provider) => run(async () => {
    if (await signInWithProvider(provider)) await finishSignIn()
  }, `Unable to sign in with ${provider}.`)

  const doSignUp = () => {
    const nameErr = !form.name.trim() ? 'Enter your name.' : ''
    const handleErr = usernameError(form.username)
    const phone = toE164(form.phone)
    const destErr = via === 'email'
      ? (!isEmail(form.email) ? 'Enter a valid email address.' : '')
      : (!phone ? 'Enter a valid phone number, like 98765 43210.' : '')
    const firstErr = nameErr || handleErr || destErr || (form.password !== form.confirmPassword ? 'Passwords do not match.' : '')
    if (firstErr) return setError(firstErr)
    return run(async () => {
      const destination = via === 'email' ? form.email.trim().toLowerCase() : phone
      const { username } = await signUp({
        username: form.username, name: form.name, password: form.password,
        ...(via === 'email' ? { email: destination } : { phone: destination }),
      })
      setPending({ username, destination, via, handle: form.username.trim().toLowerCase() })
      setNotice(`We sent a code to ${via === 'email' ? destination : maskPhone(destination)}.`)
      setMode('confirm')
    }, 'Unable to create account.')
  }
  const doConfirm = () => run(async () => {
    await confirmSignUp(pending.username, form.code.trim())
    setNotice('Account verified. You can now sign in.')
    setForm({ ...empty, identifier: pending.handle })
    setPending(null)
    setMode('signin')
  }, 'Invalid or expired code.')
  const doResend = () => run(async () => {
    if (mode === 'code') {
      const { destination } = await startCodeSignIn(toE164(form.phone))
      setSentTo(destination || sentTo)
    } else {
      await resendConfirmationCode(pending.username)
    }
    setNotice('Code resent.')
  }, 'Unable to resend code.')

  const title = mode === 'confirm' ? (pending?.via === 'phone' ? 'Verify your phone' : 'Verify your email')
    : mode === 'code' ? 'Enter the code' : 'Welcome to Sankat.AI'
  const sub = mode === 'confirm' ? 'Enter the 6-digit code we sent you.'
    : mode === 'code' ? `We texted a 6-digit code to ${sentTo}.`
    : 'Sign in to sync your emergency profile, or create an account.'
  const primary = {
    signin: method === 'password' ? ['Sign In', doSignIn] : ['Send code', doSendCode],
    signup: ['Create Account', doSignUp],
    confirm: ['Verify Account', doConfirm],
    code: ['Verify and sign in', doCodeSignIn],
  }[mode]

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}><HeartPulse size={26} color={colors.primary} /></View>
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
          <View style={styles.secured}><ShieldCheck size={13} color={colors.success} /><Text style={styles.securedText}>Secured by Amazon Cognito</Text></View>

          {!isCognitoConfigured() && <View style={styles.alertErr}><Text style={styles.alertErrText}>Cognito is not configured. Set EXPO_PUBLIC_COGNITO_* env vars.</Text></View>}
          {!!error && <View style={styles.alertErr}><Text style={styles.alertErrText}>{error}</Text></View>}
          {!!notice && !error && <View style={styles.alertOk}><Text style={styles.alertOkText}>{notice}</Text></View>}

          {(mode === 'signin' || mode === 'signup') && (
            <>
              <Segmented styles={styles} value={mode} onChange={switchMode}
                options={[['signin', 'Sign In'], ['signup', 'Create Account']]} />
              {providers.map((p) => (
                <TouchableOpacity key={p} style={styles.socialBtn} disabled={busy} onPress={() => doSocial(p)} accessibilityRole="button">
                  <Text style={styles.socialBtnText}>{mode === 'signup' ? 'Sign up' : 'Continue'} with {p}</Text>
                </TouchableOpacity>
              ))}
              {providers.length > 0 && <Text style={styles.divider}>or</Text>}
            </>
          )}

          {mode === 'signin' && (
            <>
              <Segmented styles={styles} value={method} onChange={(m) => { setMethod(m); setError('') }}
                options={[['password', 'Password'], ['code', 'Text me a code']]} small />
              {method === 'password' ? (
                <>
                  <Field label="Email, phone or username" value={form.identifier} onChangeText={set('identifier')} autoCapitalize="none" autoCorrect={false} placeholder="you@example.com" />
                  <Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry placeholder="••••••••" />
                </>
              ) : (
                <Field label="Phone number" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+91 98765 43210" />
              )}
            </>
          )}

          {mode === 'signup' && (
            <>
              <Field label="Full name" value={form.name} onChangeText={set('name')} placeholder="Asha K" />
              <Field label="Username" value={form.username} onChangeText={set('username')} autoCapitalize="none" autoCorrect={false} placeholder="asha.k" />
              <Segmented styles={styles} value={via} onChange={(v) => { setVia(v); setError('') }}
                options={[['email', 'Email'], ['phone', 'Phone']]} small />
              {via === 'email'
                ? <Field label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
                : <Field label="Phone number" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+91 98765 43210" />}
              <Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry placeholder="••••••••" />
              <Field label="Confirm password" value={form.confirmPassword} onChangeText={set('confirmPassword')} secureTextEntry placeholder="••••••••" />
            </>
          )}

          {(mode === 'confirm' || mode === 'code') && (
            <Field label="6-digit code" value={form.code} onChangeText={set('code')} keyboardType="number-pad" placeholder="123456" textContentType="oneTimeCode" autoComplete="sms-otp" />
          )}

          <TouchableOpacity style={styles.primaryBtn} disabled={busy} onPress={primary[1]}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryBtnText}>{primary[0]}</Text>}
          </TouchableOpacity>
          {(mode === 'confirm' || mode === 'code') && <TouchableOpacity onPress={doResend} style={styles.resend}><Text style={styles.resendText}>Resend code</Text></TouchableOpacity>}
          {(mode === 'confirm' || mode === 'code') && (
            <TouchableOpacity onPress={() => { cancelCodeSignIn(); switchMode('signin') }} style={styles.back}><Text style={styles.backText}>← Back to sign in</Text></TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Segmented({ styles, value, onChange, options, small = false }) {
  return (
    <View style={[styles.tabs, small && styles.tabsSmall]} accessibilityRole="radiogroup">
      {options.map(([v, label]) => (
        <TouchableOpacity key={v} style={[styles.tab, value === v && styles.tabActive]} onPress={() => onChange(v)}
          accessibilityRole="radio" accessibilityState={{ checked: value === v }}>
          <Text style={[styles.tabText, value === v && styles.tabTextActive]}>{label}</Text>
        </TouchableOpacity>
      ))}
    </View>
  )
}

function Field({ label, ...props }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.muted} accessibilityLabel={label} {...props} />
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
  tabsSmall: { marginTop: 16 },
  tab: { flex: 1, paddingVertical: 10, alignItems: 'center', borderRadius: radius.sm },
  tabActive: { backgroundColor: colors.surface },
  tabText: { fontWeight: '600', color: colors.muted },
  tabTextActive: { color: colors.primary },
  socialBtn: { borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 13, alignItems: 'center', marginTop: 14 },
  socialBtnText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  divider: { textAlign: 'center', color: colors.muted, marginTop: 14, fontSize: 13 },
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
