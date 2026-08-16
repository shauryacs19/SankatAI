// Shared profile form controls + a section-editor scaffold (header, scroll,
// loading/error/save states) reused by the Personal / Medical / Contacts screens.

import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { ArrowLeft, Check, AlertTriangle } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'

export function Field({ label, error, multiline, ...props }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <TextInput
        style={[styles.input, multiline && { height: 64, textAlignVertical: 'top' }, error && styles.inputError]}
        placeholderTextColor={colors.muted}
        multiline={multiline}
        {...props}
      />
      {!!error && <Text style={styles.fieldErr}>{error}</Text>}
    </View>
  )
}

export function Chips({ label, options, value, onSelect }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.chipsWrap}>
        {options.map((o) => (
          <TouchableOpacity key={o} style={[styles.chip, value === o && styles.chipActive]} onPress={() => onSelect(o)}>
            <Text style={[styles.chipText, value === o && styles.chipTextActive]}>{o}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

export function YesNo({ label, value, onSelect }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  return (
    <View style={styles.field}>
      {!!label && <Text style={styles.label}>{label}</Text>}
      <View style={styles.chipsWrap}>
        {[['no', 'No'], ['yes', 'Yes']].map(([v, l]) => (
          <TouchableOpacity key={v} style={[styles.chip, value === v && styles.chipActive]} onPress={() => onSelect(v)}>
            <Text style={[styles.chipText, value === v && styles.chipTextActive]}>{l}</Text>
          </TouchableOpacity>
        ))}
      </View>
    </View>
  )
}

export function SectionTitle({ Icon, title }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  return (
    <View style={styles.section}>{Icon ? <Icon size={16} color={colors.primary} /> : null}<Text style={styles.sectionTitle}>{title}</Text></View>
  )
}

// Standard editor scaffold: back header, scroll body, error banner and a Save
// button that shows a spinner while saving.
export function SectionEditor({ title, navigation, children, onSave, saving, error, saveLabel = 'Save changes', canSave = true }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} style={styles.backBtn}><ArrowLeft size={22} color={colors.text} /></TouchableOpacity>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {!!error && <View style={styles.errBanner}><AlertTriangle size={14} color={colors.primary} /><Text style={styles.errBannerText}>{error}</Text></View>}
          {children}
          <TouchableOpacity style={[styles.saveBtn, (!canSave || saving) && { opacity: 0.6 }]} onPress={onSave} disabled={!canSave || saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <><Check size={17} color="#fff" /><Text style={styles.saveText}>{saveLabel}</Text></>}
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 12, paddingVertical: 12, backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 },
  backBtn: { padding: 2 },
  headerTitle: { fontSize: 18, fontWeight: '800', color: colors.text },
  scroll: { padding: 20, paddingBottom: 40 },
  errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: radius.md, padding: 12, marginBottom: 6 },
  errBannerText: { color: colors.primary, fontSize: 13, flex: 1 },
  section: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 22, marginBottom: 4 },
  sectionTitle: { fontSize: 15, fontWeight: '800', color: colors.text },
  field: { marginTop: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  input: { borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 13, paddingVertical: 11, fontSize: 15, color: colors.text, backgroundColor: colors.surface },
  inputError: { borderColor: colors.primary },
  fieldErr: { color: colors.primary, fontSize: 12, marginTop: 5 },
  chipsWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  chip: { borderWidth: 1, borderColor: colors.border, borderRadius: 99, paddingVertical: 8, paddingHorizontal: 14, backgroundColor: colors.surface },
  chipActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipText: { color: colors.textSecondary, fontSize: 13, fontWeight: '500' },
  chipTextActive: { color: colors.primary, fontWeight: '700' },
  saveBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 15, marginTop: 28 },
  saveText: { color: '#fff', fontWeight: '700', fontSize: 16 },
})
