import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { HeartPulse, ShieldCheck, Check, Circle, Square, CheckSquare } from 'lucide-react-native'
import { isEmail, maskPhone, parseIdentifier, toE164 } from '@sankatai/shared'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import {
  signUp, confirmSignUp, resendConfirmationCode, isCognitoConfigured,
  startCodeSignIn, confirmCodeSignIn, cancelCodeSignIn,
  completeNewPassword, cancelNewPassword, resetPassword, confirmResetPassword,
} from '../lib/cognito'
import { authErrorMessage, PASSWORD_RULES, passwordOk } from '../lib/authErrors'
import { useAuth } from '../context/AuthContext'

const empty = { identifier: '', name: '', email: '', phone: '', password: '', confirmPassword: '', code: '' }
const RESEND_SECONDS = 60
const MAX_FAILURES = 5
const LOCK_SECONDS = 30

// Countdown in seconds (0 = ready). Used for "Resend code" and the client throttle.
function useCountdown() {
  const [left, setLeft] = useState(0)
  useEffect(() => {
    if (left <= 0) return undefined
    const t = setTimeout(() => setLeft((s) => s - 1), 1000)
    return () => clearTimeout(t)
  }, [left])
  return [left, setLeft]
}

// modes: signin | signup | confirm | code | newpw | forgot | reset
export default function LoginScreen({ route }) {
  const { signIn, finishSignIn } = useAuth()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [mode, setMode] = useState(route.params?.mode === 'signup' ? 'signup' : 'signin')
  const [via, setVia] = useState('email') // email | phone (sign-up)
  const [pending, setPending] = useState(null) // { username (Cognito UUID), destination, via }
  const [sentTo, setSentTo] = useState({ kind: 'phone', destination: '' })
  const [resetId, setResetId] = useState('') // identifier a reset code was requested for
  const [terms, setTerms] = useState(false)
  const [form, setForm] = useState(empty)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [busy, setBusy] = useState(false)
  // Web parity: 60 s resend cooldown; after 5 failed attempts the submit button
  // is locked for 30 s (Cognito's own lockout is the real control).
  const [cooldown, setCooldown] = useCountdown()
  const [lockedFor, setLockedFor] = useCountdown()
  const failures = useRef(0)

  // Never keep secrets around after leaving the screen.
  useEffect(() => () => { cancelNewPassword(); cancelCodeSignIn() }, [])

  const set = (k) => (v) => { setForm((p) => ({ ...p, [k]: v })); if (error) setError('') }
  const switchMode = (m) => {
    setMode(m); setError(''); setNotice('')
    setForm((p) => ({ ...p, password: '', confirmPassword: '', code: '' }))
  }
  const run = async (fn, fallback, { counts = false } = {}) => {
    if (counts && lockedFor > 0) return
    setBusy(true); setError('')
    try {
      await fn()
      if (counts) failures.current = 0
    } catch (e) {
      if (e?.code === 'NewPasswordRequired') { switchMode('newpw'); return }
      setError(authErrorMessage(e, fallback))
      if (counts && ++failures.current >= MAX_FAILURES) { failures.current = 0; setLockedFor(LOCK_SECONDS) }
    } finally { setBusy(false) }
  }

  // AuthContext.signIn authenticates, resolves the landing route (App vs
  // ProfileSetup) and flips auth state — the navigator switches on its own.
  const doSignIn = () => {
    const id = parseIdentifier(form.identifier)
    if (!id) return setError('Enter your email or phone number (with country code, or 10 digits).')
    if (!form.password) return setError('Enter your password.')
    return run(() => signIn(id.value, form.password), 'Couldn’t sign you in. Try again.', { counts: true })
  }
  // Email → emailed code; phone → texted code. Same field as password sign-in.
  const sendSignInCode = async () => {
    const id = parseIdentifier(form.identifier)
    const { destination, kind } = await startCodeSignIn(id)
    setSentTo({ kind, destination: destination || (kind === 'phone' ? maskPhone(id.value) : id.value) })
    setCooldown(RESEND_SECONDS)
  }
  const doSendCode = () => {
    if (!parseIdentifier(form.identifier)) return setError('Enter your email or phone number first.')
    return run(async () => {
      await sendSignInCode()
      setForm((p) => ({ ...p, code: '' }))
      setMode('code')
    }, 'Couldn’t send a code. Try again.')
  }
  const doCodeSignIn = () => {
    if (form.code.trim().length !== 6) return setError('Enter the 6-digit code.')
    return run(async () => { await confirmCodeSignIn(form.code.trim()); await finishSignIn() }, 'Couldn’t sign you in. Try again.', { counts: true })
  }
  const doNewPassword = () => {
    if (!passwordOk(form.password)) return setError('Choose a password that meets every requirement.')
    if (form.password !== form.confirmPassword) return setError('The passwords don’t match.')
    return run(async () => { await completeNewPassword(form.password); await finishSignIn() }, 'Couldn’t set your password. Try again.', { counts: true })
  }

  const doSignUp = () => {
    const nameErr = !form.name.trim() ? 'Enter your name.' : ''
    const phone = toE164(form.phone)
    const destErr = via === 'email'
      ? (!isEmail(form.email) ? 'Enter a valid email address.' : '')
      : (!phone ? 'Enter a valid phone number, like 98765 43210.' : '')
    const pwErr = !passwordOk(form.password) ? 'Choose a password that meets every requirement.' : ''
    const firstErr = nameErr || destErr || pwErr
      || (form.password !== form.confirmPassword ? 'The passwords don’t match.' : '')
      || (!terms ? 'Accept the terms to continue.' : '')
    if (firstErr) return setError(firstErr)
    return run(async () => {
      const destination = via === 'email' ? form.email.trim().toLowerCase() : phone
      const { username } = await signUp({
        name: form.name, password: form.password,
        ...(via === 'email' ? { email: destination } : { phone: destination }),
      })
      setPending({ username, destination, via })
      setCooldown(RESEND_SECONDS)
      switchMode('confirm')
      setNotice(`We sent a code to ${via === 'email' ? destination : maskPhone(destination)}.`)
    }, 'Couldn’t create your account. Try again.')
  }
  const doConfirm = () => {
    if (form.code.trim().length !== 6) return setError('Enter the 6-digit code.')
    return run(async () => {
      await confirmSignUp(pending.username, form.code.trim())
      setForm({ ...empty, identifier: pending.destination })
      setPending(null)
      setMode('signin')
      setNotice('Account verified. You can now sign in.')
    }, 'Invalid or expired code.')
  }
  const doResend = () => {
    if (cooldown > 0) return undefined
    return run(async () => {
      if (mode === 'code') await sendSignInCode()
      else { await resendConfirmationCode(pending.username); setCooldown(RESEND_SECONDS) }
      setNotice('Code resent.')
    }, 'Couldn’t resend the code.')
  }

  // Forgot password. Enumeration-safe: an unknown account proceeds like a known one.
  const doForgot = () => {
    const id = parseIdentifier(form.identifier)
    if (!id) return setError('Enter your email or phone number.')
    return run(async () => {
      try { await resetPassword(id.value) } catch (e) { if (e?.code !== 'UserNotFoundException') throw e }
      setResetId(id.value)
      switchMode('reset')
    }, 'Couldn’t start the reset. Try again.')
  }
  const doReset = () => {
    if (form.code.trim().length !== 6) return setError('Enter the 6-digit code.')
    if (!passwordOk(form.password)) return setError('Choose a password that meets every requirement.')
    if (form.password !== form.confirmPassword) return setError('The passwords don’t match.')
    return run(async () => {
      await confirmResetPassword(resetId, form.code.trim(), form.password)
      switchMode('signin')
      setNotice('Password reset. Sign in with your new password.')
    }, 'Couldn’t reset your password. Try again.')
  }

  const title = {
    confirm: pending?.via === 'phone' ? 'Verify your phone' : 'Verify your email',
    code: 'Enter the code',
    newpw: 'Set a new password',
    forgot: 'Reset your password',
    reset: 'Choose a new password',
  }[mode] || 'Welcome to Sankat.AI'
  const sub = {
    confirm: 'Enter the 6-digit code we sent you.',
    code: `We ${sentTo.kind === 'email' ? 'emailed' : 'texted'} a 6-digit code to ${sentTo.destination}.`,
    newpw: 'Your account needs a new password before you continue.',
    forgot: 'Enter your email or phone number. We’ll send a 6-digit code to the email or phone on the account.',
    reset: 'If that account exists, we sent a 6-digit code to its email or phone.',
  }[mode] || 'Sign in to sync your emergency profile, or create an account.'
  const primary = {
    signin: ['Sign In', doSignIn],
    signup: ['Create Account', doSignUp],
    confirm: ['Verify Account', doConfirm],
    code: ['Verify and sign in', doCodeSignIn],
    newpw: ['Set password and continue', doNewPassword],
    forgot: ['Send code', doForgot],
    reset: ['Reset password', doReset],
  }[mode]
  const throttled = lockedFor > 0 && ['signin', 'code', 'newpw'].includes(mode)
  const showsNewPassword = mode === 'signup' || mode === 'newpw' || mode === 'reset'

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <View style={styles.brandRow}><HeartPulse size={26} color={colors.primary} /></View>
          <Text style={styles.title} accessibilityRole="header">{title}</Text>
          <Text style={styles.sub}>{sub}</Text>
          <View style={styles.secured}><ShieldCheck size={13} color={colors.success} /><Text style={styles.securedText}>Secured by Amazon Cognito</Text></View>

          {!isCognitoConfigured() && <View style={styles.alertErr}><Text style={styles.alertErrText}>Sign-in isn’t configured. Set the EXPO_PUBLIC_COGNITO_* variables.</Text></View>}
          {!!error && <View style={styles.alertErr} accessibilityRole="alert"><Text style={styles.alertErrText}>{error}</Text></View>}
          {!!notice && !error && <View style={styles.alertOk}><Text style={styles.alertOkText}>{notice}</Text></View>}

          {(mode === 'signin' || mode === 'signup') && (
            <Segmented styles={styles} value={mode} onChange={switchMode}
              options={[['signin', 'Sign In'], ['signup', 'Create Account']]} />
          )}

          {mode === 'signin' && (
            <>
              <Field label="Email or phone number" value={form.identifier} onChangeText={set('identifier')} autoCapitalize="none" autoCorrect={false} autoComplete="username" textContentType="username" keyboardType="email-address" placeholder="you@example.com or +91 98765 43210" />
              <Field label="Password" value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="current-password" textContentType="password" placeholder="••••••••" />
              <TouchableOpacity onPress={() => switchMode('forgot')} style={styles.forgot} accessibilityRole="link">
                <Text style={styles.resendText}>Forgot password?</Text>
              </TouchableOpacity>
            </>
          )}

          {mode === 'signup' && (
            <>
              <Field label="Full name" value={form.name} onChangeText={set('name')} autoComplete="name" placeholder="Asha K" />
              <Segmented styles={styles} value={via} onChange={(v) => { setVia(v); setError('') }}
                options={[['email', 'Email'], ['phone', 'Phone']]} small />
              {via === 'email'
                ? <Field label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoComplete="email" placeholder="you@example.com" />
                : <Field label="Phone number" value={form.phone} onChangeText={set('phone')} keyboardType="phone-pad" autoComplete="tel" placeholder="+91 98765 43210"
                    hint="We’ll text a code to verify it. You can then sign in with a texted code." />}
            </>
          )}

          {mode === 'forgot' && (
            <Field label="Email or phone number" value={form.identifier} onChangeText={set('identifier')} autoCapitalize="none" autoCorrect={false} autoComplete="username" placeholder="you@example.com" />
          )}

          {(mode === 'confirm' || mode === 'code' || mode === 'reset') && (
            <Field label="6-digit code" value={form.code} onChangeText={(v) => set('code')(v.replace(/\D/g, '').slice(0, 6))} keyboardType="number-pad" placeholder="123456" textContentType="oneTimeCode" autoComplete="sms-otp" maxLength={6} />
          )}

          {showsNewPassword && (
            <>
              <Field label={mode === 'signup' ? 'Password' : 'New password'} value={form.password} onChangeText={set('password')} secureTextEntry autoComplete="new-password" textContentType="newPassword" placeholder="••••••••" />
              <PasswordChecklist password={form.password} styles={styles} colors={colors} />
              <Field label={mode === 'signup' ? 'Confirm password' : 'Confirm new password'} value={form.confirmPassword} onChangeText={set('confirmPassword')} secureTextEntry autoComplete="new-password" placeholder="••••••••" />
            </>
          )}

          {mode === 'signup' && (
            <TouchableOpacity style={styles.terms} onPress={() => { setTerms((t) => !t); setError('') }}
              accessibilityRole="checkbox" accessibilityState={{ checked: terms }}>
              {terms ? <CheckSquare size={20} color={colors.primary} /> : <Square size={20} color={colors.muted} />}
              <Text style={styles.termsText}>I understand SankatAI gives guidance, not a diagnosis, and I accept the terms of use.</Text>
            </TouchableOpacity>
          )}

          <TouchableOpacity style={[styles.primaryBtn, (busy || throttled) && { opacity: 0.6 }]} disabled={busy || throttled} onPress={primary[1]} accessibilityRole="button">
            {busy ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.primaryBtnText}>{primary[0]}</Text>}
          </TouchableOpacity>
          {throttled && <Text style={styles.hint}>Too many attempts. Try again in {lockedFor}s.</Text>}

          {mode === 'signin' && (
            <TouchableOpacity onPress={doSendCode} style={styles.resend} disabled={busy || throttled} accessibilityRole="link">
              <Text style={styles.resendText}>
                {parseIdentifier(form.identifier)?.kind === 'email' ? 'Email me a code' : parseIdentifier(form.identifier)?.kind === 'phone' ? 'Text me a code' : 'Send me a code'}
              </Text>
            </TouchableOpacity>
          )}

          {(mode === 'confirm' || mode === 'code') && (
            <TouchableOpacity onPress={doResend} style={styles.resend} disabled={cooldown > 0 || busy}>
              <Text style={[styles.resendText, cooldown > 0 && { color: colors.muted }]}>{cooldown > 0 ? `Resend code (${cooldown}s)` : 'Resend code'}</Text>
            </TouchableOpacity>
          )}
          {mode === 'reset' && (
            <TouchableOpacity onPress={() => switchMode('forgot')} style={styles.resend}><Text style={styles.resendText}>Use a different account</Text></TouchableOpacity>
          )}
          {['confirm', 'code', 'newpw', 'forgot', 'reset'].includes(mode) && (
            <TouchableOpacity onPress={() => { cancelCodeSignIn(); cancelNewPassword(); switchMode('signin') }} style={styles.back}><Text style={styles.backText}>← Back to sign in</Text></TouchableOpacity>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

// Live password policy (mirrors the Cognito pool policy in Terraform).
function PasswordChecklist({ password, styles, colors }) {
  return (
    <View style={styles.rules} accessibilityLabel="Password requirements">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password)
        return (
          <View key={r.id} style={styles.rule} accessibilityState={{ checked: ok }}>
            {ok ? <Check size={14} color={colors.success} /> : <Circle size={12} color={colors.muted} />}
            <Text style={[styles.ruleText, ok && { color: colors.success }]}>{r.label}</Text>
          </View>
        )
      })}
    </View>
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

function Field({ label, hint, ...props }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{label}</Text>
      <TextInput style={styles.input} placeholderTextColor={colors.muted} accessibilityLabel={label} {...props} />
      {!!hint && <Text style={styles.hint}>{hint}</Text>}
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
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  hint: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 6, textAlign: 'left' },
  forgot: { alignSelf: 'flex-end', marginTop: 10, paddingVertical: 4 },
  rules: { marginTop: 10, gap: 4 },
  rule: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  ruleText: { color: colors.muted, fontSize: 12.5 },
  terms: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, marginTop: 18 },
  termsText: { flex: 1, color: colors.textSecondary, fontSize: 13, lineHeight: 19 },
  primaryBtn: { backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, alignItems: 'center', marginTop: 22 },
  primaryBtnText: { color: colors.onPrimary, fontWeight: '700', fontSize: 16 },
  resend: { alignItems: 'center', marginTop: 14 },
  resendText: { color: colors.primary, fontWeight: '600' },
  back: { alignItems: 'center', marginTop: 20 },
  backText: { color: colors.muted },
  alertErr: { backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 16 },
  alertErrText: { color: colors.danger, fontSize: 13 },
  alertOk: { backgroundColor: colors.successSoft, borderColor: colors.successBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, marginTop: 16 },
  alertOkText: { color: colors.success, fontSize: 13 },
})
