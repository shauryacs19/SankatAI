// Chat history, moved out of the drawer into its own tab (web parity).
// Lists past consultations; tapping one opens it in the Chat tab.

import { useCallback, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Modal, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Search, X, Plus, MessageSquare, Pencil, Trash2, History as HistoryIcon, Check } from 'lucide-react-native'
import { radius, sevColor } from '../../theme'
import { useTheme } from '../../context/ThemeContext'
import { useChat } from '../../context/ChatContext'
import ScreenHeader from '../../components/ScreenHeader'
import usePullRefresh from '../../components/usePullRefresh'

export default function HistoryScreen({ navigation }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const { filtered, searching, activeId, search, setSearch, select, startNew, loadList, renameChat, deleteChat } = useChat()

  const onRefresh = useCallback(async () => { await loadList() }, [loadList])
  const refreshControl = usePullRefresh(onRefresh)

  const openChat = (id) => { select(id); navigation?.navigate?.('Chat') }
  const newChat = async () => { await startNew(); navigation?.navigate?.('Chat') }

  // Rename modal (Alert.prompt is iOS-only, so this is a real modal)
  const [renameTarget, setRenameTarget] = useState(null)
  const [renameValue, setRenameValue] = useState('')
  const [saving, setSaving] = useState(false)
  const openRename = (c) => { setRenameTarget(c); setRenameValue(c.title || '') }
  const closeRename = () => { setRenameTarget(null); setRenameValue(''); setSaving(false) }
  const submitRename = async () => {
    const title = renameValue.trim()
    if (!renameTarget || !title || saving) return
    setSaving(true)
    try { await renameChat(renameTarget.consultationId, title); closeRename() } catch { setSaving(false) }
  }
  const confirmDelete = (id) => {
    Alert.alert('Delete chat', 'This conversation will be removed.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteChat(id) },
    ])
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScreenHeader title="History" navigation={navigation} />
      <View style={styles.headRow}>
        <View style={styles.searchBox}>
          <Search size={15} color={colors.muted} />
          <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search chats" placeholderTextColor={colors.muted} />
          {!!search && <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}><X size={15} color={colors.muted} /></TouchableOpacity>}
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={newChat} accessibilityLabel="New chat"><Plus size={20} color="#fff" /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
        {searching ? (
          <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.emptyText}>Searching…</Text></View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            {search.trim() ? <Search size={28} color={colors.muted} /> : <HistoryIcon size={28} color={colors.muted} />}
            <Text style={styles.emptyText}>{search.trim() ? 'No chats found.' : 'No consultations yet.'}</Text>
          </View>
        ) : filtered.map((c) => {
          const on = activeId === c.consultationId
          return (
            <TouchableOpacity key={c.consultationId} style={[styles.row, on && styles.rowOn]} onPress={() => openChat(c.consultationId)} activeOpacity={0.85}>
              {c.lastSeverity
                ? <View style={[styles.dot, { backgroundColor: sevColor(c.lastSeverity) }]} />
                : <MessageSquare size={15} color={colors.muted} />}
              <Text numberOfLines={1} style={[styles.rowText, on && { color: colors.primary }]}>{c.title || 'New consultation'}</Text>
              <TouchableOpacity onPress={() => openRename(c)} hitSlop={8} style={styles.act}><Pencil size={15} color={colors.muted} /></TouchableOpacity>
              <TouchableOpacity onPress={() => confirmDelete(c.consultationId)} hitSlop={8} style={styles.act}><Trash2 size={15} color={colors.muted} /></TouchableOpacity>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <Modal visible={!!renameTarget} animationType="fade" transparent onRequestClose={closeRename}>
        <View style={styles.scrim}>
          <View style={styles.modal}>
            <View style={styles.modalHead}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}><Pencil size={15} color={colors.primary} /><Text style={styles.modalTitle}>Rename chat</Text></View>
              <TouchableOpacity onPress={closeRename} disabled={saving}><X size={18} color={colors.muted} /></TouchableOpacity>
            </View>
            <TextInput style={styles.modalInput} value={renameValue} onChangeText={setRenameValue} maxLength={80} autoFocus placeholder="Chat name" placeholderTextColor={colors.muted} />
            <View style={styles.modalActions}>
              <TouchableOpacity style={styles.ghost} onPress={closeRename} disabled={saving}><Text style={styles.ghostText}>Cancel</Text></TouchableOpacity>
              <TouchableOpacity style={[styles.primary, (!renameValue.trim() || saving) && { opacity: 0.5 }]} onPress={submitRename} disabled={!renameValue.trim() || saving}>
                {saving ? <ActivityIndicator color="#fff" /> : <><Check size={15} color="#fff" /><Text style={styles.primaryText}>Save</Text></>}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  headRow: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 16, paddingTop: 12 },
  searchBox: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, paddingHorizontal: 12, height: 44 },
  searchInput: { flex: 1, color: colors.text, fontSize: 14, paddingVertical: 0 },
  newBtn: { width: 44, height: 44, borderRadius: 22, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: 16, gap: 8 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md },
  rowOn: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  rowText: { flex: 1, fontSize: 14, fontWeight: '600', color: colors.text },
  dot: { width: 9, height: 9, borderRadius: 5 },
  act: { padding: 4 },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  modalInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.text, backgroundColor: colors.bg },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  ghost: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface2 },
  ghostText: { color: colors.textSecondary, fontWeight: '700' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.primary },
  primaryText: { color: '#fff', fontWeight: '700' },
})
