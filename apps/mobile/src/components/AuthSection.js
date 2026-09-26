// Authentication section — account details, password change and sign out.
// Rendered inside the Settings screen (not a tab of its own).

import { useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator, Alert } from 'react-native'
import { KeyRound, Mail, ShieldCheck, LogOut, Check, AlertTriangle, Lock, Phone, AtSign } from 'lucide-react-native'
import { normalizeUsername, usernameError } from '@sankatai/shared'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { useProfile } from '../context/ProfileContext'
import { useAuth } from '../context/AuthContext'
import { changePassword, getCurrentAccount, updateUsername } from '../lib/cognito'

const MIN_LEN = 8

export default function AuthSection() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const { profile } = useProfile()
  const { signOut } = useAuth()
  const confirmSignOut = () => Alert.alert(
    'Sign out?',
    "You'll need to sign in again to use SankatAI on this device. Your data stays in your account.",
    [{ text: 'Cancel', style: 'cancel' }, { text: 'Sign out', style: 'destructive', onPress: signOut }],
  )
  const [account, setAccount] = useState(getCurrentAccount)
  const email = account.email || profile?.email || ''
  const method = !account.hasPassword ? 'Google or Facebook' : account.phone ? 'Password or texted code' : 'Password'

  // Username (Cognito preferred_username; unique, usable to sign in).
  const [handle, setHandle] = useState(account.username || '')
  const [handleBusy, setHandleBusy] = useState(false)
  const [handleMsg, setHandleMsg] = useState(null) // { ok: boolean, text }
  const handleUnchanged = normalizeUsername(handle) === (account.username || '')
  const saveHandle = async () => {
    const problem = usernameError(handle)
    if (problem) return setHandleMsg({ ok: false, text: problem })
    setHandleBusy(true); setHandleMsg(null)
    try {
      setAccount(await updateUsername(handle))
      setHandleMsg({ ok: true, text: 'Username saved.' })
    } catch (e) {
      setHandleMsg({ ok: false, text: e?.code === 'AliasExistsException' ? 'That username is taken. Try another.' : (e?.message || 'Could not save your username.') })
    } finally { setHandleBusy(false) }
    return undefined
  }

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const tooShort = next.length > 0 && next.length < MIN_LEN
  const mismatch = confirm.length > 0 && next !== confirm
  const canSave = !!current && next.length >= MIN_LEN && next === confirm && !busy
  const touch = () => { setError(''); setDone(false) }

  const submit = async () => {
    if (!canSave) return
    setBusy(true); setError(''); setDone(false)
    try {
      await changePassword(current, next)
      setCurrent(''); setNext(''); setConfirm(''); setDone(true)
    } catch (e) {
      setError(e.message || 'Could not change your password.')
    } finally { setBusy(false) }
  }

  return (
    <>
        <View style={styles.card}>
          <View style={styles.cardTitleRow}><ShieldCheck size={15} color={colors.primary} /><Text style={styles.cardTitle}>Account</Text></View>
          {!!email && (
            <View style={styles.row}>
              <View style={styles.rowLabel}><Mail size={14} color={colors.muted} /><Text style={styles.rowLabelText}>Email</Text></View>
              <Text style={styles.rowValue} numberOfLines={1}>{email}</Text>
            </View>
          )}
          {!!account.phone && (
            <View style={styles.row}>
              <View style={styles.rowLabel}><Phone size={14} color={colors.muted} /><Text style={styles.rowLabelText}>Phone</Text></View>
              <Text style={styles.rowValue} numberOfLines={1}>{account.phone}</Text>
            </View>
          )}
          <View style={styles.row}>
            <View style={styles.rowLabel}><Lock size={14} color={colors.muted} /><Text style={styles.rowLabelText}>Sign-in method</Text></View>
            <Text style={styles.rowValue}>{method}</Text>
          </View>
          <Text style={styles.note}>Sign-in is handled by AWS Cognito. SankatAI never stores your password.</Text>
        </View>

        <View style={styles.card}>
          <View style={styles.cardTitleRow}><AtSign size={15} color={colors.primary} /><Text style={styles.cardTitle}>Username</Text></View>
          <Text style={styles.note}>{account.username ? 'You can sign in with your username, email or phone number.' : 'Choose a username. You can sign in with it instead of your email or phone.'}</Text>
          <TextInput style={styles.input} value={handle} onChangeText={(t) => { setHandle(t); setHandleMsg(null) }} autoCapitalize="none" autoCorrect={false} maxLength={20} placeholder="asha.k" placeholderTextColor={colors.muted} accessibilityLabel="Username" />
          {!!handleMsg && (
            <View style={[styles.alert, handleMsg.ok ? styles.alertOk : styles.alertErr]}>
              {handleMsg.ok ? <Check size={14} color={colors.success} /> : <AlertTriangle size={14} color={colors.sevEmergency} />}
              <Text style={[styles.alertText, { color: handleMsg.ok ? colors.success : colors.sevEmergency }]}>{handleMsg.text}</Text>
            </View>
          )}
          <TouchableOpacity style={[styles.primary, (handleUnchanged || handleBusy) && { opacity: 0.5 }]} onPress={saveHandle} disabled={handleUnchanged || handleBusy}>
            {handleBusy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>{account.username ? 'Change username' : 'Save username'}</Text>}
          </TouchableOpacity>
        </View>

        {account.hasPassword && <View style={styles.card}>
          <View style={styles.cardTitleRow}><KeyRound size={15} color={colors.primary} /><Text style={styles.cardTitle}>Change password</Text></View>

          <Text style={styles.label}>Current password</Text>
          <TextInput style={styles.input} value={current} onChangeText={(t) => { setCurrent(t); touch() }} secureTextEntry autoCapitalize="none" placeholder="Enter your current password" placeholderTextColor={colors.muted} />

          <Text style={styles.label}>New password</Text>
          <TextInput style={[styles.input, tooShort && { borderColor: colors.sevEmergency }]} value={next} onChangeText={(t) => { setNext(t); touch() }} secureTextEntry autoCapitalize="none" placeholder={`At least ${MIN_LEN} characters`} placeholderTextColor={colors.muted} />
          {tooShort && <Text style={styles.err}>Use at least {MIN_LEN} characters.</Text>}

          <Text style={styles.label}>Confirm new password</Text>
          <TextInput style={[styles.input, mismatch && { borderColor: colors.sevEmergency }]} value={confirm} onChangeText={(t) => { setConfirm(t); touch() }} secureTextEntry autoCapitalize="none" placeholder="Re-enter the new password" placeholderTextColor={colors.muted} />
          {mismatch && <Text style={styles.err}>Passwords do not match.</Text>}

          {!!error && <View style={[styles.alert, styles.alertErr]}><AlertTriangle size={14} color={colors.sevEmergency} /><Text style={[styles.alertText, { color: colors.sevEmergency }]}>{error}</Text></View>}
          {done && <View style={[styles.alert, styles.alertOk]}><Check size={14} color={colors.success} /><Text style={[styles.alertText, { color: colors.success }]}>Password updated.</Text></View>}

          <TouchableOpacity style={[styles.primary, !canSave && { opacity: 0.5 }]} onPress={submit} disabled={!canSave}>
            {busy ? <ActivityIndicator color="#fff" /> : <Text style={styles.primaryText}>Update password</Text>}
          </TouchableOpacity>
        </View>}

        <View style={styles.card}>
          <View style={styles.cardTitleRow}><LogOut size={15} color={colors.primary} /><Text style={styles.cardTitle}>Session</Text></View>
          <Text style={styles.note}>Signing out clears this device's session. Your data stays in your account.</Text>
          <TouchableOpacity style={styles.signOut} onPress={confirmSignOut} accessibilityRole="button">
            <LogOut size={17} color={colors.sevEmergency} />
            <Text style={styles.signOutText}>Sign out</Text>
          </TouchableOpacity>
        </View>
    </>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  card: { marginTop: 14, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  cardTitle: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12, paddingVertical: 9, borderTopColor: colors.border, borderTopWidth: 1 },
  rowLabel: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  rowLabelText: { fontSize: 13, color: colors.muted },
  rowValue: { flexShrink: 1, fontSize: 13.5, fontWeight: '600', color: colors.text, textAlign: 'right' },
  note: { marginTop: 12, fontSize: 12.5, lineHeight: 18, color: colors.muted },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 12, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.text, backgroundColor: colors.bg },
  err: { fontSize: 12, color: colors.sevEmergency, marginTop: 6 },
  alert: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.md, borderWidth: 1, padding: 10, marginTop: 14 },
  alertErr: { backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder },
  alertOk: { backgroundColor: colors.surface2, borderColor: colors.border },
  alertText: { flex: 1, fontSize: 12.5 },
  primary: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 13, marginTop: 18 },
  primaryText: { color: '#fff', fontWeight: '700', fontSize: 14.5 },
  signOut: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, marginTop: 14, borderWidth: 1, borderColor: colors.primaryBorder, backgroundColor: colors.primarySoft, borderRadius: radius.md, paddingVertical: 13 },
  signOutText: { color: colors.sevEmergency, fontWeight: '700', fontSize: 14.5 },
})
