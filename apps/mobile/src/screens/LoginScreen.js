import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, Alert } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Check, ChevronDown, Eye, EyeOff, HeartPulse, KeyRound, MessageSquareText, ShieldCheck, X } from 'lucide-react-native'
import { isEmail, maskPhone, parseIdentifier, PASSWORD_RULES, preSignUpMessage, toE164, usernameError } from '@sankatai/shared'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import {
  signUp, confirmSignUp, resendConfirmationCode, isCognitoConfigured,
  startCodeSignIn, confirmCodeSignIn, cancelCodeSignIn,
} from '../lib/cognito'
import { useAuth } from '../context/AuthContext'

const empty = { identifier: '', username: '', name: '', email: '', phone: '', password: '', confirmPassword: '', code: '' }
const MOBILE_PASSWORD_RULES = Array.isArray(PASSWORD_RULES) ? PASSWORD_RULES : [
  { id: 'len', label: 'At least 8 characters', test: (p) => p.length >= 8 },
  { id: 'lower', label: 'A lowercase letter', test: (p) => /[a-z]/.test(p) },
  { id: 'upper', label: 'An uppercase letter', test: (p) => /[A-Z]/.test(p) },
  { id: 'number', label: 'A number', test: (p) => /\d/.test(p) },
]
const mobilePasswordOk = (password) => MOBILE_PASSWORD_RULES.every((rule) => rule.test(String(password || '')))

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
  if (code === 'NetworkError' || /network request failed|network error|failed to fetch/i.test(e?.message || '')) return 'Can’t reach the account service. Check that this device has internet access, then try again.'
  return e?.message || fallback
}

export default function LoginScreen({ route, navigation }) {
  const { signIn, finishSignIn } = useAuth()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [mode, setMode] = useState(route?.params?.mode === 'signup' ? 'signup' : 'signin') // signin | signup | confirm | code
  const [method, setMethod] = useState('password') // password | code | passkey (sign-in)
  const [methodChoicesOpen, setMethodChoicesOpen] = useState(false)
  const [via, setVia] = useState('email') // email | phone (sign-up)
  const [pending, setPending] = useState(null) // { username (Cognito UUID), destination, via, handle }
  const [sentTo, setSentTo] = useState('')
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)

  const set = (k) => (v) => { setForm((p) => ({ ...p, [k]: v })); if (error) setError('') }
  const switchMode = (m) => { setMode(m); setMethod('password'); setMethodChoicesOpen(false); setError(''); setNotice('') }
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

  const doSignUp = () => {
    const nameErr = !form.name.trim() ? 'Enter your name.' : ''
    const handleErr = usernameError(form.username)
    const phone = toE164(form.phone)
    const destErr = via === 'email'
      ? (!isEmail(form.email) ? 'Enter a valid email address.' : '')
      : (!phone ? 'Enter a valid phone number, like 98765 43210.' : '')
    const firstErr = nameErr || handleErr || destErr
      || (!mobilePasswordOk(form.password) ? 'Choose a password that meets every requirement.' : '')
      || (!form.confirmPassword ? 'Confirm your password.' : form.password !== form.confirmPassword ? 'Passwords do not match.' : '')
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
    await confirmSignUp(pending.username, form.code.trim(), pending.handle)
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
    signin: method === 'password' ? ['Sign In', doSignIn]
      : method === 'code' ? ['Send code', doSendCode]
        : ['Use passkey on the website', () => Alert.alert('Passkey sign-in', 'Passkeys are tied to the SankatAI website’s domain and can’t be used from Expo Go. Choose password or a texted code to sign in here.')],
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
            </>
          )}

          {mode === 'signin' && (
            <>
              {method === 'password' ? (
                <>
                  <Field label="Email, phone or username" value={form.identifier} onChangeText={set('identifier')} autoCapitalize="none" autoCorrect={false} placeholder="you@example.com" />
                  <PasswordField styles={styles} colors={colors} label="Password" value={form.password} onChangeText={set('password')} placeholder="Enter your password" />
                  <TouchableOpacity style={styles.methodLink} onPress={() => setMethodChoicesOpen((open) => !open)} accessibilityRole="button" accessibilityState={{ expanded: methodChoicesOpen }}>
                    <Text style={styles.methodLinkText}>Prefer another way to sign in?</Text>
                    <ChevronDown size={15} color={colors.primary} style={methodChoicesOpen && { transform: [{ rotate: '180deg' }] }} />
                  </TouchableOpacity>
                  {methodChoicesOpen && <View style={styles.methodOptions}>
                    <TouchableOpacity style={styles.methodOption} onPress={() => { setMethod('code'); setError('') }}>
                      <View style={styles.methodIcon}><MessageSquareText size={18} color={colors.primary} /></View>
                      <View style={styles.methodCopy}><Text style={styles.methodTitle}>Text me a code</Text><Text style={styles.methodSub}>Use your verified phone number</Text></View>
                    </TouchableOpacity>
                    <TouchableOpacity style={styles.methodOption} onPress={() => { setMethod('passkey'); setError('') }}>
                      <View style={styles.methodIcon}><KeyRound size={18} color={colors.primary} /></View>
                      <View style={styles.methodCopy}><Text style={styles.methodTitle}>Passkey</Text><Text style={styles.methodSub}>Use a passkey saved to your device</Text></View>
                    </TouchableOpacity>
                  </View>}
                </>
              ) : method === 'code' ? (
                <>
                  <Field label="Phone number" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+91 98765 43210" />
                  <TouchableOpacity style={styles.methodLink} onPress={() => { setMethod('password'); setMethodChoicesOpen(true) }}><Text style={styles.methodLinkText}>Back to sign-in options</Text></TouchableOpacity>
                </>
              ) : (
                <View style={styles.passkeyInfo}>
                  <View style={styles.methodIcon}><KeyRound size={20} color={colors.primary} /></View>
                  <Text style={styles.passkeyTitle}>Passkeys are available on the SankatAI website</Text>
                  <Text style={styles.passkeyBody}>Passkeys are tied to the website’s domain and this app doesn’t support WebAuthn yet. You can sign in here with your password or a texted code.</Text>
                  <TouchableOpacity onPress={() => { setMethod('password'); setMethodChoicesOpen(true) }} style={styles.passkeyBack}><Text style={styles.methodLinkText}>Choose another sign-in method</Text></TouchableOpacity>
                </View>
              )}
            </>
          )}

          {mode === 'signup' && (
            <>
              <Field label="Full name" value={form.name} onChangeText={set('name')} placeholder="Asha K" />
              <Field label="Username" value={form.username} onChangeText={set('username')} autoCapitalize="none" autoCorrect={false} placeholder="asha.k" />
              <Text style={styles.fieldHint}>Letters, numbers, dots and underscores. Use this, your email or phone to sign in.</Text>
              <Segmented styles={styles} value={via} onChange={(v) => { setVia(v); setError('') }}
                options={[['email', 'Email'], ['phone', 'Phone']]} small />
              {via === 'email'
                ? <Field label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" placeholder="you@example.com" />
                : <Field label="Phone number" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" placeholder="+91 98765 43210" />}
              <PasswordField styles={styles} colors={colors} label="Password" value={form.password} onChangeText={set('password')} placeholder="Create a password" />
              <PasswordChecklist password={form.password} colors={colors} styles={styles} />
              <PasswordField styles={styles} colors={colors} label="Confirm password" value={form.confirmPassword} onChangeText={set('confirmPassword')} placeholder="Enter it again" />
              {!!form.confirmPassword && <View style={styles.matchRow}>
                {form.password === form.confirmPassword ? <Check size={14} color={colors.success} /> : <X size={14} color={colors.danger} />}
                <Text style={[styles.matchText, { color: form.password === form.confirmPassword ? colors.success : colors.danger }]}>{form.password === form.confirmPassword ? 'Passwords match' : 'Passwords do not match'}</Text>
              </View>}
            </>
          )}

          {(mode === 'confirm' || mode === 'code') && (
            <Field label="6-digit code" value={form.code} onChangeText={set('code')} keyboardType="number-pad" placeholder="123456" textContentType="oneTimeCode" autoComplete="sms-otp" />
          )}

          <TouchableOpacity style={styles.primaryBtn} disabled={busy} onPress={primary[1]}>
            {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryBtnText}>{primary[0]}</Text>}
          </TouchableOpacity>
          {mode === 'signin' && method === 'password' && <TouchableOpacity onPress={() => navigation.navigate('Guest')} style={styles.guestLink}><Text style={styles.guestLinkText}>Try SankatAI without an account</Text></TouchableOpacity>}
          {(mode === 'confirm' || mode === 'code') && <TouchableOpacity onPress={doResend} style={styles.resend}><Text style={styles.resendText}>Resend code</Text></TouchableOpacity>}
          {(mode === 'confirm' || mode === 'code') && (
            <TouchableOpacity onPress={() => { cancelCodeSignIn(); setMethod('password'); setMethodChoicesOpen(false); switchMode('signin') }} style={styles.back}><Text style={styles.backText}>← Back to sign in</Text></TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

function Segmented({ styles, value, onChange, options, small = false }) {
  return (
    <View style={[styles.tabs, small && styles.tabsSmall]} accessibilityRole="radiogroup">
      {(Array.isArray(options) ? options : []).map(([v, label]) => (
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

function PasswordField({ styles, colors, label, ...props }) {
  const [shown, setShown] = useState(false)
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <View style={styles.passwordWrap}>
        <TextInput style={[styles.input, styles.passwordInput]} placeholderTextColor={colors.muted} secureTextEntry={!shown} accessibilityLabel={label} autoCapitalize="none" autoCorrect={false} {...props} />
        <TouchableOpacity style={styles.passwordToggle} onPress={() => setShown((value) => !value)} accessibilityLabel={shown ? 'Hide password' : 'Show password'} accessibilityRole="button">
          {shown ? <EyeOff size={18} color={colors.muted} /> : <Eye size={18} color={colors.muted} />}
        </TouchableOpacity>
      </View>
    </View>
  )
}

function PasswordChecklist({ password, colors, styles }) {
  return (
    <View style={styles.passwordChecklist} accessibilityLabel="Password requirements">
      {MOBILE_PASSWORD_RULES.map((rule) => {
        const met = rule.test(password)
        return <View key={rule.id} style={styles.passwordRule}>
          {met ? <Check size={14} color={colors.success} /> : <X size={14} color={colors.muted} />}
          <Text style={[styles.passwordRuleText, met && { color: colors.success }]}>{rule.label}</Text>
        </View>
      })}
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
  field: { marginTop: 16 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  fieldHint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 6 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  passwordWrap: { position: 'relative', justifyContent: 'center' },
  passwordInput: { paddingRight: 50 },
  passwordToggle: { position: 'absolute', right: 12, width: 34, height: 42, alignItems: 'center', justifyContent: 'center' },
  passwordChecklist: { flexDirection: 'row', flexWrap: 'wrap', columnGap: 13, rowGap: 7, marginTop: 10 },
  passwordRule: { flexDirection: 'row', alignItems: 'center', gap: 5, minWidth: '46%' },
  passwordRuleText: { color: colors.muted, fontSize: 12 },
  matchRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 6 },
  matchText: { fontSize: 12, fontWeight: '600' },
  methodLink: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, marginTop: 14, paddingVertical: 8 },
  methodLinkText: { color: colors.primary, fontSize: 13, fontWeight: '700' },
  methodOptions: { backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, overflow: 'hidden', marginTop: 2 },
  methodOption: { flexDirection: 'row', alignItems: 'center', gap: 11, padding: 12, minHeight: 68 },
  methodIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  methodCopy: { flex: 1, gap: 3 },
  methodTitle: { color: colors.text, fontSize: 14, fontWeight: '700' },
  methodSub: { color: colors.muted, fontSize: 12 },
  passkeyInfo: { alignItems: 'center', gap: 10, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 18, marginTop: 18 },
  passkeyTitle: { color: colors.text, fontSize: 16, fontWeight: '800', textAlign: 'center' },
  passkeyBody: { color: colors.textSecondary, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  passkeyBack: { marginTop: 4, paddingVertical: 6 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
  primaryBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
  guestLink: { alignItems: 'center', paddingVertical: 14 },
  guestLinkText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  resend: { alignItems: 'center', marginTop: 14 },
  resendText: { color: colors.primary, fontWeight: '600' },
  back: { alignItems: 'center', marginTop: 20 },
  backText: { color: colors.muted },
  alertErr: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 16 },
  alertErrText: { color: colors.danger, fontSize: 13 },
  alertOk: { backgroundColor: colors.successSoft, borderColor: colors.successBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 16 },
  alertOkText: { color: colors.success, fontSize: 13 },
})
