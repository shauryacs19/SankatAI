// Chat history, moved out of the drawer into its own tab (web parity).
// Past consultations grouped by day (Today / Yesterday / Earlier); tapping one
// opens it in the Chat tab. Delete asks first; failures say so (toast).

import { useCallback, useMemo, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, Alert, Modal, ActivityIndicator } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Search, X, Plus, MessageSquare, Pencil, Trash2, History as HistoryIcon, Check, AlertTriangle } from 'lucide-react-native'
import { radius, sevColor } from '../../theme'
import { useTheme } from '../../context/ThemeContext'
import { useChat } from '../../context/ChatContext'
import ScreenHeader from '../../components/ScreenHeader'
import usePullRefresh from '../../components/usePullRefresh'
import { useToast } from '../../components/Toast'
import { groupConsults, relTime, SEV_LABEL } from '../../lib/chat'
import { errText } from '../../lib/errText'

export default function HistoryScreen({ navigation }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const { filtered, searching, activeId, search, setSearch, select, startNew, loadList, renameChat, deleteChat, listError } = useChat()
  const toast = useToast()
  const grouped = useMemo(() => groupConsults(filtered), [filtered])
  const [retrying, setRetrying] = useState(false)
  const retry = async () => { setRetrying(true); await loadList(); setRetrying(false) }
  const q = search.trim()

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
    try { await renameChat(renameTarget.consultationId, title); closeRename() } catch (e) {
      setSaving(false)
      toast.error(errText(e, 'Could not rename the chat.'))
    }
  }
  const confirmDelete = (c) => {
    const name = c.title || 'New consultation'
    Alert.alert('Delete this chat?', `“${name}” and its messages will be removed from your history. This can't be undone.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete chat',
        style: 'destructive',
        onPress: async () => {
          try { await deleteChat(c.consultationId); toast.success('Chat deleted.') }
          catch (e) { toast.error(errText(e, 'Could not delete the chat. Please try again.')) }
        },
      },
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
        <TouchableOpacity style={styles.newBtn} onPress={newChat} accessibilityLabel="New chat"><Plus size={20} color={colors.onPrimary} /></TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
        <Text style={styles.lead}>Open a past consultation to continue where you left off. Search looks inside messages too.</Text>
        {searching ? (
          <View style={styles.empty}><ActivityIndicator color={colors.primary} /><Text style={styles.emptyText}>Searching…</Text></View>
        ) : listError && !q && filtered.length === 0 ? (
          <View style={styles.empty}>
            <AlertTriangle size={28} color={colors.muted} />
            <Text style={styles.emptyTitle}>Couldn't load your chats</Text>
            <Text style={styles.emptyText}>{listError} Your conversations are safe — try again.</Text>
            <TouchableOpacity style={styles.cta} onPress={retry} disabled={retrying}>
              {retrying ? <ActivityIndicator color={colors.onPrimary} /> : <Text style={styles.ctaText}>Try again</Text>}
            </TouchableOpacity>
          </View>
        ) : filtered.length === 0 ? (
          q ? (
            <View style={styles.empty}>
              <Search size={28} color={colors.muted} />
              <Text style={styles.emptyTitle}>No chats match “{q}”</Text>
              <Text style={styles.emptyText}>Try a different word, such as a symptom or body part.</Text>
              <TouchableOpacity style={styles.ctaGhost} onPress={() => setSearch('')}><Text style={styles.ctaGhostText}>Clear search</Text></TouchableOpacity>
            </View>
          ) : (
            <View style={styles.empty}>
              <HistoryIcon size={28} color={colors.muted} />
              <Text style={styles.emptyTitle}>No consultations yet</Text>
              <Text style={styles.emptyText}>When you describe symptoms to SankatAI, the conversation is saved here so you can come back to it.</Text>
              <TouchableOpacity style={styles.cta} onPress={newChat}><Plus size={15} color={colors.onPrimary} /><Text style={styles.ctaText}>Start a chat</Text></TouchableOpacity>
            </View>
          )
        ) : grouped.map(([label, items]) => (
          <View key={label} style={styles.group}>
            <Text style={styles.groupLabel} accessibilityRole="header">{label.toUpperCase()}</Text>
            {items.map((c) => {
              const on = activeId === c.consultationId
              const sevLabel = SEV_LABEL[c.lastSeverity]
              return (
                <TouchableOpacity key={c.consultationId} style={[styles.row, on && styles.rowOn]} onPress={() => openChat(c.consultationId)} activeOpacity={0.85}>
                  {c.lastSeverity
                    ? <View style={[styles.dot, { backgroundColor: sevColor(c.lastSeverity) }]} />
                    : <MessageSquare size={15} color={colors.muted} />}
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text numberOfLines={1} style={[styles.rowText, on && { color: colors.primary }]}>{c.title || 'New consultation'}</Text>
                    <Text numberOfLines={1} style={styles.rowMeta}>{relTime(c.updatedAt)}{sevLabel ? ` · ${sevLabel}` : ''}</Text>
                  </View>
                  <TouchableOpacity onPress={() => openRename(c)} hitSlop={8} style={styles.act} accessibilityLabel={`Rename “${c.title || 'New consultation'}”`}><Pencil size={15} color={colors.muted} /></TouchableOpacity>
                  <TouchableOpacity onPress={() => confirmDelete(c)} hitSlop={8} style={styles.act} accessibilityLabel={`Delete “${c.title || 'New consultation'}”`}><Trash2 size={15} color={colors.muted} /></TouchableOpacity>
                </TouchableOpacity>
              )
            })}
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
  scroll: { padding: 16, gap: 8 },
  lead: { color: colors.muted, fontSize: 13, lineHeight: 19, marginBottom: 4 },
  empty: { alignItems: 'center', gap: 10, paddingVertical: 48, paddingHorizontal: 12 },
  emptyTitle: { color: colors.text, fontSize: 16, fontWeight: '700', textAlign: 'center' },
  emptyText: { color: colors.muted, fontSize: 13, lineHeight: 19, textAlign: 'center' },
  cta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 6, paddingVertical: 11, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.primary },
  ctaText: { color: colors.onPrimary, fontWeight: '700' },
  ctaGhost: { marginTop: 6, paddingVertical: 10, paddingHorizontal: 16, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border },
  ctaGhostText: { color: colors.text, fontWeight: '600' },
  group: { gap: 8 },
  groupLabel: { color: colors.muted, fontSize: 11, fontWeight: '700', letterSpacing: 0.8, marginTop: 6 },
  rowMeta: { color: colors.muted, fontSize: 12, marginTop: 2 },
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
  primaryText: { color: colors.onPrimary, fontWeight: '700' },
})
