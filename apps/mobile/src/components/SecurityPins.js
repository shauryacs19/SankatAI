// Security PINs — account-level PINs used to password-protect files. Users can
// keep one default PIN or create several. Values are never shown; the backend
// stores only PBKDF2 hashes. Rendered inside the Profile screen.

import { useCallback, useEffect, useState } from 'react'
import { View, Text, TouchableOpacity, TextInput, Modal, ActivityIndicator, StyleSheet } from 'react-native'
import { ShieldCheck, Lock, Trash2, Plus, AlertTriangle, X } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { listPins, deletePin } from '../lib/api'
import CreatePinModal from './CreatePinModal'

const fmtDate = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
}

export default function SecurityPins() {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [pins, setPins] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [addOpen, setAddOpen] = useState(false)

  // deleting a PIN requires entering that PIN
  const [delTarget, setDelTarget] = useState(null)
  const [delPin, setDelPin] = useState('')
  const [delErr, setDelErr] = useState('')
  const [delBusy, setDelBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true); setError('')
    try { const l = await listPins(); setPins(Array.isArray(l) ? l : []) }
    catch (e) { setError(e.message || 'Could not load PINs.') }
    finally { setLoading(false) }
  }, [])
  useEffect(() => { load() }, [load])

  const openAdd = () => setAddOpen(true)

  const openRemove = (p) => { setDelTarget(p); setDelPin(''); setDelErr('') }
  const submitRemove = async () => {
    if (delPin.length !== 6 || delBusy) return
    setDelBusy(true); setDelErr('')
    try {
      await deletePin(delTarget.id, delPin)
      setPins((prev) => prev.filter((x) => x.id !== delTarget.id))
      setDelTarget(null)
    } catch (e) {
      setDelErr(/403|incorrect/i.test(e.message || '') ? 'Incorrect PIN.' : (e.message || 'Could not delete the PIN.'))
    } finally { setDelBusy(false) }
  }

  return (
    <View style={styles.card}>
      <View style={styles.titleRow}><ShieldCheck size={15} color={colors.primary} /><Text style={styles.title}>Security PINs</Text></View>
      <Text style={styles.sub}>Create PINs to password-protect files. When uploading, choose which PIN to use.</Text>

      {!!error && <View style={styles.err}><AlertTriangle size={13} color={colors.primary} /><Text style={styles.errText}>{error}</Text></View>}

      {loading ? (
        <Text style={styles.empty}>Loading…</Text>
      ) : pins.length === 0 ? (
        <Text style={styles.empty}>No PINs yet. Add one to start protecting files.</Text>
      ) : (
        <View style={{ gap: 8, marginTop: 4 }}>
          {pins.map((p) => (
            <View key={p.id} style={styles.row}>
              <View style={styles.rowIcon}><Lock size={15} color={colors.textSecondary} /></View>
              <View style={{ flex: 1 }}>
                <Text style={styles.rowLabel}>{p.label}</Text>
                {!!p.createdAt && <Text style={styles.rowDate}>Created {fmtDate(p.createdAt)}</Text>}
              </View>
              <TouchableOpacity onPress={() => openRemove(p)} hitSlop={8} style={styles.del}><Trash2 size={15} color={colors.muted} /></TouchableOpacity>
            </View>
          ))}
        </View>
      )}

      <TouchableOpacity style={styles.addBtn} onPress={openAdd}><Plus size={15} color={colors.primary} /><Text style={styles.addText}>Add PIN</Text></TouchableOpacity>

      <Modal visible={!!delTarget} animationType="fade" transparent onRequestClose={() => !delBusy && setDelTarget(null)}>
        <View style={styles.scrim}>
          <View style={styles.modal}>
            <View style={styles.modalHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1, paddingRight: 8 }}>
                <Trash2 size={15} color={colors.primary} />
                <Text numberOfLines={1} style={styles.modalTitle}>Delete “{delTarget?.label}”</Text>
              </View>
              <TouchableOpacity onPress={() => setDelTarget(null)} disabled={delBusy}><X size={18} color={colors.muted} /></TouchableOpacity>
            </View>
            <Text style={styles.sub}>Enter this PIN to delete it. Files protected with it must be moved first.</Text>
            <TextInput
              style={[styles.mInput, !!delErr && { borderColor: colors.primary }]}
              value={delPin}
              onChangeText={(t) => { setDelPin(t.replace(/\D/g, '').slice(0, 6)); setDelErr('') }}
              maxLength={6}
              placeholder="••••••"
              placeholderTextColor={colors.muted}
              keyboardType="number-pad"
              secureTextEntry
              autoFocus
            />
            {!!delErr && <Text style={styles.mErr}>{delErr}</Text>}
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.ghost} onPress={() => setDelTarget(null)} disabled={delBusy}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, (delPin.length !== 6 || delBusy) && { opacity: 0.5 }]} onPress={submitRemove} disabled={delPin.length !== 6 || delBusy}>
                {delBusy ? <ActivityIndicator color="#fff" /> : <><Trash2 size={15} color="#fff" /><Text style={styles.primaryText}>Delete PIN</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <CreatePinModal
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onCreated={(created) => { setPins((prev) => [...prev, created]); setAddOpen(false) }}
      />
    </View>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 16 },
  titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  title: { fontSize: 12, fontWeight: '700', color: colors.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  sub: { color: colors.muted, fontSize: 13, marginTop: 6, lineHeight: 18 },
  err: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: radius.sm, padding: 10, marginTop: 10 },
  errText: { color: colors.primary, fontSize: 12, flex: 1 },
  empty: { color: colors.muted, fontSize: 13, marginTop: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderTopColor: colors.border, borderTopWidth: 1 },
  rowIcon: { width: 32, height: 32, borderRadius: 9, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  rowLabel: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowDate: { fontSize: 12, color: colors.muted },
  del: { padding: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, marginTop: 14 },
  addText: { color: colors.primary, fontWeight: '600' },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text, flexShrink: 1 },
  mInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 18, color: colors.text, backgroundColor: colors.bg, letterSpacing: 6, textAlign: 'center', marginTop: 12 },
  mErr: { color: colors.primary, fontSize: 12, marginTop: 8 },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  ghost: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface2 },
  ghostText: { color: colors.textSecondary, fontWeight: '700' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.primary },
  primaryText: { color: '#fff', fontWeight: '700' },
})
