// Generic dropdown: a field-styled button that opens a modal list of options.
// Optional search for long lists (e.g. languages).

import { useMemo, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native'
import { ChevronDown, Check, X, Search } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'

export default function SelectModal({ label, value, options, onChange, placeholder = 'Select…', searchable = false }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const data = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? options.filter((o) => String(o).toLowerCase().includes(q)) : options
  }, [options, query])

  const choose = (o) => { onChange(o); setOpen(false); setQuery('') }

  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TouchableOpacity style={styles.btn} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={[styles.btnText, !value && { color: colors.muted }]}>{value || placeholder}</Text>
        <ChevronDown size={18} color={colors.muted} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <View style={styles.head}>
              <Text style={styles.title}>{label || 'Select'}</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}><X size={20} color={colors.muted} /></TouchableOpacity>
            </View>
            {searchable && (
              <View style={styles.searchBox}>
                <Search size={16} color={colors.muted} />
                <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search" placeholderTextColor={colors.muted} autoFocus />
                {!!query && <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}><X size={15} color={colors.muted} /></TouchableOpacity>}
              </View>
            )}
            <FlatList
              data={data}
              keyExtractor={(o) => String(o)}
              keyboardShouldPersistTaps="handled"
              renderItem={({ item }) => (
                <TouchableOpacity style={styles.row} onPress={() => choose(item)}>
                  <Text style={styles.rowText}>{item}</Text>
                  {item === value && <Check size={16} color={colors.primary} />}
                </TouchableOpacity>
              )}
              ListEmptyComponent={<Text style={styles.empty}>No matches.</Text>}
            />
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
  btnText: { fontSize: 15, color: colors.text, fontWeight: '600' },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: '70%', paddingTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingVertical: 14, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  rowText: { fontSize: 15, color: colors.text },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: 30 },
})
