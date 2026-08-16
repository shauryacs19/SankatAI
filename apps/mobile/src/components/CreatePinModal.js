// Create-PIN modal, extracted from SecurityPins so the Documents upload sheet can
// reuse the exact same popup. PIN values are never shown or stored on device;
// the backend keeps only PBKDF2 hashes. `onCreated(pin)` fires with the record.

import { useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, Modal, ActivityIndicator, StyleSheet } from 'react-native'
import { ShieldCheck, X, Check } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { createPin } from '../lib/api'

export default function CreatePinModal({ visible, onClose, onCreated }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [label, setLabel] = useState('')
  const [pin, setPin] = useState('')
  const [confirm, setConfirm] = useState('')
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  const mismatch = confirm.length === 6 && pin.length === 6 && pin !== confirm
  const canSave = pin.length === 6 && confirm.length === 6 && pin === confirm && !saving
  const reset = () => { setLabel(''); setPin(''); setConfirm(''); setFormErr('') }
  const close = () => { if (saving) return; reset(); onClose?.() }

  const submit = async () => {
    if (!canSave) return
    setSaving(true); setFormErr('')
    try {
      const created = await createPin({ pin, label: label.trim() || null })
      reset()
      onCreated?.(created)
    } catch (e) { setFormErr(e.message || 'Could not create the PIN.') }
    finally { setSaving(false) }
  }

  return (
    <Modal visible={visible} animationType="fade" transparent onRequestClose={close}>
      <View style={styles.scrim}>
        <View style={styles.modal}>
          <View style={styles.modalHead}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><ShieldCheck size={15} color={colors.primary} /><Text style={styles.modalTitle}>New security PIN</Text></View>
            <TouchableOpacity onPress={close}><X size={18} color={colors.muted} /></TouchableOpacity>
          </View>

          <Text style={styles.mLabel}>Label <Text style={styles.mHint}>(optional)</Text></Text>
          <TextInput style={styles.mInput} value={label} maxLength={40} placeholder="e.g. Personal, Reports" placeholderTextColor={colors.muted} onChangeText={setLabel} />

          <Text style={styles.mLabel}>Enter 6-digit PIN</Text>
          <TextInput style={styles.mInput} value={pin} maxLength={6} placeholder="••••••" placeholderTextColor={colors.muted} keyboardType="number-pad" secureTextEntry onChangeText={(t) => setPin(t.replace(/\D/g, '').slice(0, 6))} />

          <Text style={styles.mLabel}>Confirm PIN</Text>
          <TextInput style={[styles.mInput, mismatch && { borderColor: colors.primary }]} value={confirm} maxLength={6} placeholder="••••••" placeholderTextColor={colors.muted} keyboardType="number-pad" secureTextEntry onChangeText={(t) => setConfirm(t.replace(/\D/g, '').slice(0, 6))} />

          {mismatch && <Text style={styles.mErr}>PINs do not match.</Text>}
          {!!formErr && <Text style={styles.mErr}>{formErr}</Text>}

          <View style={styles.modalActions}>
            <TouchableOpacity style={styles.ghost} onPress={close} disabled={saving}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>
            <TouchableOpacity style={[styles.primary, !canSave && { opacity: 0.5 }]} onPress={submit} disabled={!canSave}>
              {saving ? <ActivityIndicator color="#fff" /> : <><Check size={15} color="#fff" /><Text style={styles.primaryText}>Create PIN</Text></>}
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  mLabel: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 12, marginBottom: 6 },
  mHint: { color: colors.muted, fontWeight: '400' },
  mInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.text, backgroundColor: colors.bg, letterSpacing: 2 },
  mErr: { color: colors.primary, fontSize: 12, marginTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  ghost: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface2 },
  ghostText: { color: colors.textSecondary, fontWeight: '700' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.primary },
  primaryText: { color: '#fff', fontWeight: '700' },
})
