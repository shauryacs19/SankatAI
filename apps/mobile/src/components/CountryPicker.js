// Phone country selector: a compact button showing flag + dial code that opens a
// searchable modal list of every country (flag, name, +prefix).

import { useMemo, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Modal, FlatList, StyleSheet } from 'react-native'
import { Search, X, Check, ChevronDown } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { COUNTRIES } from '../lib/countries'

export default function CountryPicker({ value, onChange }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const data = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return COUNTRIES
    return COUNTRIES.filter((c) => c.name.toLowerCase().includes(q) || c.dial.includes(q) || c.code.toLowerCase() === q)
  }, [query])

  const choose = (c) => { onChange(c); setOpen(false); setQuery('') }

  return (
    <>
      <TouchableOpacity style={styles.btn} onPress={() => setOpen(true)} activeOpacity={0.7}>
        <Text style={styles.flag}>{value?.flag}</Text>
        <Text style={styles.dial}>+{value?.dial}</Text>
        <ChevronDown size={16} color={colors.muted} />
      </TouchableOpacity>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <View style={styles.scrim}>
          <View style={styles.sheet}>
            <View style={styles.head}>
              <Text style={styles.title}>Select country</Text>
              <TouchableOpacity onPress={() => setOpen(false)} hitSlop={10}><X size={20} color={colors.muted} /></TouchableOpacity>
            </View>
            <View style={styles.searchBox}>
              <Search size={16} color={colors.muted} />
              <TextInput style={styles.searchInput} value={query} onChangeText={setQuery} placeholder="Search country or code" placeholderTextColor={colors.muted} autoFocus />
              {!!query && <TouchableOpacity onPress={() => setQuery('')} hitSlop={8}><X size={15} color={colors.muted} /></TouchableOpacity>}
            </View>
            <FlatList
              data={data}
              keyExtractor={(c) => c.code}
              keyboardShouldPersistTaps="handled"
              initialNumToRender={16}
              renderItem={({ item }) => {
                const on = item.code === value?.code
                return (
                  <TouchableOpacity style={styles.row} onPress={() => choose(item)}>
                    <Text style={styles.rowFlag}>{item.flag}</Text>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                    <Text style={styles.rowDial}>+{item.dial}</Text>
                    {on && <Check size={16} color={colors.primary} />}
                  </TouchableOpacity>
                )
              }}
              ListEmptyComponent={<Text style={styles.empty}>No matches.</Text>}
            />
          </View>
        </View>
      </Modal>
    </>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  btn: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: colors.surface },
  flag: { fontSize: 18 },
  dial: { fontSize: 15, fontWeight: '700', color: colors.text },
  scrim: { flex: 1, backgroundColor: 'rgba(15,23,42,0.45)', justifyContent: 'flex-end' },
  sheet: { backgroundColor: colors.bg, borderTopLeftRadius: 20, borderTopRightRadius: 20, height: '80%', paddingTop: 14 },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 18, paddingBottom: 12 },
  title: { fontSize: 16, fontWeight: '700', color: colors.text },
  searchBox: { flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 16, marginBottom: 8, backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10 },
  searchInput: { flex: 1, fontSize: 15, color: colors.text, padding: 0 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 18, paddingVertical: 13, borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
  rowFlag: { fontSize: 22 },
  rowName: { flex: 1, fontSize: 15, color: colors.text },
  rowDial: { fontSize: 14, color: colors.muted, fontWeight: '600' },
  empty: { textAlign: 'center', color: colors.muted, paddingVertical: 30 },
})
