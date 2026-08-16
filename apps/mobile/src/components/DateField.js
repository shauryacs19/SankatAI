// Read-only date field that opens the wheel scroller in a popup — used on the
// profile edit page (onboarding uses the wheels inline instead).

import { useState } from 'react'
import { View, Text, TouchableOpacity, Modal, StyleSheet } from 'react-native'
import { Calendar, X, Check } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { DateWheels } from './WheelPicker'

const fmt = (v) => {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v || '')) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

export default function DateField({ label, value, onChange, error }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [open, setOpen] = useState(false)
  const [draft, setDraft] = useState(value || '2000-01-01')
  const pretty = fmt(value)

  const openPicker = () => { setDraft(value || '2000-01-01'); setOpen(true) }
  const confirm = () => { onChange(draft); setOpen(false) }

  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity style={[styles.btn, error && styles.btnError]} onPress={openPicker} activeOpacity={0.7}>
        <Text style={[styles.btnText, !pretty && { color: colors.muted }]}>{pretty || 'Select date'}</Text>
        <Calendar size={18} color={colors.muted} />
      </TouchableOpacity>
      {!!error && <Text style={styles.err}>{error}</Text>}

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <View style={styles.head}>
              <Text style={styles.title}>Date of birth</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}><X size={20} color={colors.muted} /></TouchableOpacity>
            </View>
            <DateWheels value={draft} onChange={setDraft} minYear={1947} />
            <TouchableOpacity style={styles.done} onPress={confirm} activeOpacity={0.85}><Check size={17} color="#fff" /><Text style={styles.doneText}>Done</Text></TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  field: { marginTop: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  btn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 13, paddingVertical: 13, backgroundColor: colors.surface },
  btnError: { borderColor: colors.primary },
  btnText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  err: { color: colors.primary, fontSize: 12, marginTop: 5 },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 18, paddingBottom: 26 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  done: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 14, marginTop: 18 },
  doneText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
