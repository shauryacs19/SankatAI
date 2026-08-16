import { useState } from 'react'
import { View, Text, TouchableOpacity, ScrollView, StyleSheet, Modal, ActivityIndicator, Alert, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Plus, Pencil, Trash2, User, Phone, X, Check, AlertTriangle } from 'lucide-react-native'
import { radius } from '../../theme'
import { useTheme } from '../../context/ThemeContext'
import { useProfile } from '../../context/ProfileContext'
import { saveProfile } from '../../lib/api'
import { isPhone } from '../../lib/validators'
import { Field } from '../../components/FormControls'

const MAX = 3
const emptyDraft = { name: '', relationship: '', phone: '' }

export default function EmergencyContactsScreen({ navigation }) {
  const { profile, setProfile } = useProfile()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [contacts, setContacts] = useState(() => (Array.isArray(profile?.emergencyContacts) ? profile.emergencyContacts : []))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  // edit window
  const [modalOpen, setModalOpen] = useState(false)
  const [editIndex, setEditIndex] = useState(null) // null = adding a new contact
  const [draft, setDraft] = useState(emptyDraft)
  const [fieldErr, setFieldErr] = useState({})

  const setD = (k) => (v) => { setDraft((p) => ({ ...p, [k]: v })); if (fieldErr[k]) setFieldErr((e) => ({ ...e, [k]: undefined })) }

  const openAdd = () => {
    if (contacts.length >= MAX) { Alert.alert(`You can save up to ${MAX} contacts.`); return }
    setEditIndex(null); setDraft(emptyDraft); setFieldErr({}); setModalOpen(true)
  }
  const openEdit = (i) => { setEditIndex(i); setDraft({ ...emptyDraft, ...contacts[i] }); setFieldErr({}); setModalOpen(true) }
  const closeModal = () => { setModalOpen(false); setDraft(emptyDraft); setFieldErr({}) }

  // PUT replaces the whole profile — merge the new contact list over it.
  const persist = async (newList) => {
    setSaving(true); setError('')
    try {
      const saved = await saveProfile({ ...profile, emergencyContacts: newList })
      setProfile(saved)
      setContacts(Array.isArray(saved?.emergencyContacts) ? saved.emergencyContacts : newList)
      return true
    } catch (e) { setError(e.message || 'Could not save. Please try again.'); return false }
    finally { setSaving(false) }
  }

  const saveDraft = async () => {
    const name = draft.name.trim()
    const phone = draft.phone.trim()
    const e = {}
    if (!name) e.name = 'Name is required.'
    if (!phone) e.phone = 'Phone is required.'
    else if (!isPhone(phone)) e.phone = 'Enter a valid phone number.'
    setFieldErr(e)
    if (Object.keys(e).length) return
    const entry = { name, relationship: draft.relationship.trim(), phone }
    const newList = editIndex === null ? [...contacts, entry] : contacts.map((c, i) => (i === editIndex ? entry : c))
    if (await persist(newList)) closeModal()
  }

  const removeContact = (i) => {
    Alert.alert('Delete contact', `Remove “${contacts[i]?.name || 'this contact'}”?`, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => persist(contacts.filter((_, j) => j !== i)) },
    ])
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}><ArrowLeft size={22} color={colors.text} /></TouchableOpacity>
        <Text style={styles.headerTitle}>Emergency contacts</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        {!!error && <View style={styles.errBanner}><AlertTriangle size={14} color={colors.primary} /><Text style={styles.errBannerText}>{error}</Text></View>}
        <Text style={styles.hint}>Save up to {MAX} people to reach in an emergency. Include the country code (e.g. +91…) so SOS calling and WhatsApp work.</Text>

        {contacts.length === 0 ? (
          <View style={styles.empty}>
            <User size={30} color={colors.muted} />
            <Text style={styles.emptyText}>No contacts yet.</Text>
          </View>
        ) : (
          <View style={{ gap: 12, marginTop: 4 }}>
            {contacts.map((c, i) => (
              <View key={i} style={styles.card}>
                <View style={styles.avatar}><User size={18} color={colors.primary} /></View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardName} numberOfLines={1}>{c.name || 'Contact'}</Text>
                  {!!c.relationship && <Text style={styles.cardMeta} numberOfLines={1}>{c.relationship}</Text>}
                  <View style={styles.phoneRow}><Phone size={12} color={colors.muted} /><Text style={styles.cardPhone} numberOfLines={1}>{c.phone || '—'}</Text></View>
                </View>
                <TouchableOpacity onPress={() => openEdit(i)} hitSlop={8} style={styles.cardBtn}><Pencil size={16} color={colors.textSecondary} /></TouchableOpacity>
                <TouchableOpacity onPress={() => removeContact(i)} hitSlop={8} style={styles.cardBtn}><Trash2 size={16} color={colors.muted} /></TouchableOpacity>
              </View>
            ))}
          </View>
        )}

        {contacts.length < MAX && (
          <TouchableOpacity style={styles.addBtn} onPress={openAdd} disabled={saving}>
            {saving && !modalOpen ? <ActivityIndicator color={colors.primary} /> : <><Plus size={16} color={colors.primary} /><Text style={styles.addText}>Add contact</Text></>}
          </TouchableOpacity>
        )}
      </ScrollView>

      {/* Edit window */}
      <Modal visible={modalOpen} animationType="fade" transparent onRequestClose={() => !saving && closeModal()}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <View style={styles.scrim}>
            <View style={styles.modal}>
              <View style={styles.modalHead}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><User size={16} color={colors.primary} /><Text style={styles.modalTitle}>{editIndex === null ? 'Add contact' : 'Edit contact'}</Text></View>
                <TouchableOpacity onPress={closeModal} disabled={saving}><X size={18} color={colors.muted} /></TouchableOpacity>
              </View>
              <Field label="Name" value={draft.name} onChangeText={setD('name')} error={fieldErr.name} autoFocus />
              <Field label="Relationship (optional)" value={draft.relationship} onChangeText={setD('relationship')} placeholder="e.g. Spouse, Parent" />
              <Field label="Phone" value={draft.phone} onChangeText={setD('phone')} keyboardType="phone-pad" placeholder="+91 98765 43210" error={fieldErr.phone} />
              <View style={styles.modalActions}>
                <TouchableOpacity style={styles.ghost} onPress={closeModal} disabled={saving}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>
                <TouchableOpacity style={[styles.primary, saving && { opacity: 0.6 }]} onPress={saveDraft} disabled={saving}>
                  {saving ? <ActivityIndicator color="#fff" /> : <><Check size={15} color="#fff" /><Text style={styles.primaryText}>Save contact</Text></>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  scroll: { padding: 20, paddingBottom: 40 },
  errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 12 },
  errBannerText: { color: colors.primary, fontSize: 13, flex: 1 },
  hint: { color: colors.muted, fontSize: 13, lineHeight: 19 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 44, marginTop: 12, borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.lg },
  emptyText: { color: colors.muted, fontSize: 14 },
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg },
  avatar: { width: 42, height: 42, borderRadius: 12, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  cardName: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardMeta: { fontSize: 13, color: colors.textSecondary, marginTop: 1 },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 },
  cardPhone: { fontSize: 13, color: colors.muted, flexShrink: 1 },
  cardBtn: { padding: 6 },
  addBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 12, paddingHorizontal: 16, marginTop: 16 },
  addText: { color: colors.primary, fontWeight: '700', fontSize: 14 },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 20 },
  ghost: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface2 },
  ghostText: { color: colors.textSecondary, fontWeight: '700' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.primary },
  primaryText: { color: '#fff', fontWeight: '700' },
})
