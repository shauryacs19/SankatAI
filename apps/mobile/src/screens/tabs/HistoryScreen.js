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

const groupConsults = (list) => {
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const yesterday = new Date(start); yesterday.setDate(yesterday.getDate() - 1)
  const groups = { Today: [], Yesterday: [], Earlier: [] }
  list.forEach((chat) => {
    const date = chat.updatedAt ? new Date(chat.updatedAt) : null
    groups[date && date >= start ? 'Today' : date && date >= yesterday ? 'Yesterday' : 'Earlier'].push(chat)
  })
  return Object.entries(groups).filter(([, rows]) => rows.length)
}

const relativeTime = (iso) => {
  if (!iso) return ''
  const date = new Date(iso)
  const seconds = Math.max(0, (Date.now() - date.getTime()) / 1000)
  if (seconds < 60) return 'just now'
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`
  return date.toLocaleDateString()
}

export default function HistoryScreen({ navigation }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const { filtered, searching, activeId, search, setSearch, select, startNew, loadList, renameChat, deleteChat } = useChat()
  const groups = groupConsults(filtered)

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
    <SafeAreaView style={styles.safe} edges={navigation?.shellManaged ? [] : ['top']}>
      <ScreenHeader title="History" navigation={navigation} />
      <View style={styles.headRow}>
        <View style={styles.searchBox}>
          <Search size={15} color={colors.muted} />
          <TextInput style={styles.searchInput} value={search} onChangeText={setSearch} placeholder="Search chats" placeholderTextColor={colors.muted} />
          {!!search && <TouchableOpacity onPress={() => setSearch('')} hitSlop={8}><X size={15} color={colors.muted} /></TouchableOpacity>}
        </View>
        <TouchableOpacity style={styles.newBtn} onPress={newChat} accessibilityLabel="New chat"><Plus size={20} color="#fff" /></TouchableOpacity>
      </View>

      <Text style={styles.description}>Open a past consultation to continue where you left off. Search looks inside messages too.</Text>

      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
        {searching ? (
          <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.emptyText}>Searching…</Text></View>
        ) : filtered.length === 0 ? (
          <View style={styles.empty}>
            {search.trim() ? <Search size={28} color={colors.muted} /> : <HistoryIcon size={28} color={colors.muted} />}
            <Text style={styles.emptyText}>{search.trim() ? 'No chats found.' : 'No consultations yet.'}</Text>
          </View>
        ) : groups.map(([label, chats]) => (
          <View key={label} style={styles.group}>
            <Text style={styles.groupLabel}>{label}</Text>
            <View style={styles.listCard}>
              {chats.map((c, index) => {
                const on = activeId === c.consultationId
                return (
                  <TouchableOpacity key={c.consultationId} style={[styles.row, index > 0 && styles.rowBorder, on && styles.rowOn]} onPress={() => openChat(c.consultationId)} activeOpacity={0.85}>
                    <View style={styles.rowIcon}>{c.lastSeverity ? <View style={[styles.dot, { backgroundColor: sevColor(c.lastSeverity) }]} /> : <MessageSquare size={16} color={colors.muted} />}</View>
                    <View style={styles.rowCopy}>
                      <Text numberOfLines={1} style={[styles.rowText, on && { color: colors.primary }]}>{c.title || 'New consultation'}</Text>
                      <Text style={styles.rowMeta}>{relativeTime(c.updatedAt)}</Text>
                    </View>
                    <TouchableOpacity onPress={() => openRename(c)} hitSlop={8} style={styles.act} accessibilityLabel="Rename chat"><Pencil size={15} color={colors.muted} /></TouchableOpacity>
                    <TouchableOpacity onPress={() => confirmDelete(c.consultationId)} hitSlop={8} style={styles.act} accessibilityLabel="Delete chat"><Trash2 size={15} color={colors.muted} /></TouchableOpacity>
                  </TouchableOpacity>
                )
              })}
            </View>
          </View>
        ))}
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
                {saving ? <ActivityIndicator color={colors.onPrimary} /> : <><Check size={15} color={colors.onPrimary} /><Text style={styles.primaryText}>Save</Text></>}
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
  scroll: { padding: 16, gap: 18, paddingBottom: 28 },
  description: { color: colors.muted, fontSize: 13, lineHeight: 19, paddingHorizontal: 16, paddingTop: 8 },
  group: { gap: 7 },
  groupLabel: { color: colors.textSecondary, fontSize: 12, fontWeight: '700', letterSpacing: 0.2 },
  listCard: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, overflow: 'hidden' },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 60 },
  emptyText: { color: colors.muted, fontSize: 13 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 62, paddingHorizontal: 12, paddingVertical: 9 },
  rowBorder: { borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border },
  rowOn: { backgroundColor: colors.primarySoft },
  rowIcon: { width: 28, alignItems: 'center', justifyContent: 'center' },
  rowCopy: { flex: 1, minWidth: 0 },
  rowText: { fontSize: 14, fontWeight: '600', color: colors.text },
  rowMeta: { fontSize: 11, color: colors.muted, marginTop: 3 },
  dot: { width: 9, height: 9, borderRadius: 5 },
  act: { padding: 4 },
  scrim: { flex: 1, backgroundColor: colors.scrim, alignItems: 'center', justifyContent: 'center', padding: 24 },
  modal: { width: '100%', backgroundColor: colors.surface, borderRadius: radius.lg, padding: 18 },
  modalHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  modalTitle: { fontSize: 16, fontWeight: '700', color: colors.text },
  modalInput: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 11, fontSize: 15, color: colors.text, backgroundColor: colors.bg },
  modalActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10, marginTop: 18 },
  ghost: { paddingVertical: 11, paddingHorizontal: 16, borderRadius: radius.md, backgroundColor: colors.surface2 },
  ghostText: { color: colors.textSecondary, fontWeight: '700' },
  primary: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 11, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.primary },
  primaryText: { color: colors.onPrimary, fontWeight: '700' },
})
