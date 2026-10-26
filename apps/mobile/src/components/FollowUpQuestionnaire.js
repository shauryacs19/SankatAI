import { useMemo, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native'
import { Check, ChevronLeft, ChevronRight, Send } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { OTHER, answerOf, composeAnswers, visibleItems } from '../../../../packages/shared/questionnaire'

export default function FollowUpQuestionnaire({ items, onSubmit, disabled = false }) {
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [values, setValues] = useState({})
  const [other, setOther] = useState({})
  const [note, setNote] = useState('')
  const [step, setStep] = useState(0)
  const [busy, setBusy] = useState(false)
  const shown = useMemo(() => visibleItems(items, values), [items, values])
  const index = Math.min(step, shown.length)
  const review = index >= shown.length
  const current = shown[index]
  const answered = shown.filter((item) => answerOf(item, values, other)).length
  const typing = current && (current.kind === 'text' || values[current.id] === OTHER)
  const advance = () => setStep((value) => Math.min(value + 1, shown.length))
  const submit = async () => {
    if (!answered || busy || disabled) return
    const result = composeAnswers(items, values, other, note)
    setBusy(true)
    try { await onSubmit(result.text, result.answers) } finally { setBusy(false) }
  }

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <Text style={styles.progress}>{review ? 'Review your answers' : `Question ${index + 1} of ${shown.length}`}</Text>
        <View style={styles.dots}>{shown.map((item, i) => <View key={item.id} style={[styles.dot, i === index && styles.dotActive, answerOf(item, values, other) && styles.dotDone]} />)}</View>
      </View>

      {review ? (
        <View style={styles.review}>
          {shown.map((item) => (
            <TouchableOpacity key={item.id} style={styles.reviewRow} onPress={() => setStep(shown.indexOf(item))}>
              <Text style={styles.reviewQuestion}>{item.short || item.question}</Text>
              <Text style={styles.reviewAnswer}>{answerOf(item, values, other) || 'Skipped'}  ·  Change</Text>
            </TouchableOpacity>
          ))}
          <TextInput value={note} onChangeText={setNote} placeholder="Anything else to add? (optional)" placeholderTextColor={colors.muted} multiline maxLength={1000} style={[styles.input, styles.note]} />
          <Text style={styles.count}>{answered} of {shown.length} answered</Text>
        </View>
      ) : current ? (
        <View>
          <Text style={styles.question}>{current.question}</Text>
          {current.kind !== 'text' && [...(current.options || []), ...(current.allowOther ? [{ value: OTHER, label: 'Other' }] : [])].map((option, i) => {
            const selected = values[current.id] === option.value
            return (
              <TouchableOpacity key={`${current.id}-${option.value}`} style={[styles.option, selected && styles.optionSelected]} onPress={() => setValues((v) => ({ ...v, [current.id]: option.value }))} activeOpacity={0.78}>
                <Text style={[styles.optionNum, selected && styles.optionNumSelected]}>{i + 1}</Text>
                <Text style={[styles.optionText, selected && styles.optionTextSelected]}>{option.label}</Text>
                {selected && <Check size={17} color={colors.primary} />}
              </TouchableOpacity>
            )
          })}
          {typing && <TextInput value={other[current.id] || ''} onChangeText={(value) => setOther((v) => ({ ...v, [current.id]: value }))} placeholder={current.kind === 'text' ? 'Type your answer' : 'Type your answer'} placeholderTextColor={colors.muted} multiline maxLength={300} style={styles.input} />}
        </View>
      ) : null}

      <View style={styles.actions}>
        {index > 0 && <TouchableOpacity style={styles.secondary} onPress={() => setStep(index - 1)}><ChevronLeft size={16} color={colors.textSecondary} /><Text style={styles.secondaryText}>Back</Text></TouchableOpacity>}
        {!review ? (
          <TouchableOpacity style={[styles.primary, styles.pushRight]} onPress={advance}>
            <Text style={styles.primaryText}>{typing && !String(other[current.id] || '').trim() ? 'Skip' : 'Next'}</Text><ChevronRight size={16} color={colors.onPrimary} />
          </TouchableOpacity>
        ) : (
          <TouchableOpacity style={[styles.primary, styles.pushRight, (!answered || busy || disabled) && styles.disabled]} onPress={submit} disabled={!answered || busy || disabled}>
            {busy ? <ActivityIndicator size="small" color={colors.onPrimary} /> : <Send size={15} color={colors.onPrimary} />}
            <Text style={styles.primaryText}>Send answers</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  card: { borderWidth: 1, borderColor: colors.primaryBorder, borderRadius: radius.md, backgroundColor: colors.surfaceSunken || colors.surface2, padding: 14, gap: 12 },
  header: { gap: 10 },
  progress: { color: colors.primaryText || colors.primary, fontSize: 13, fontWeight: '700' },
  dots: { flexDirection: 'row', gap: 5 },
  dot: { flex: 1, height: 4, borderRadius: 3, backgroundColor: colors.border },
  dotActive: { backgroundColor: colors.primary },
  dotDone: { backgroundColor: colors.success },
  question: { fontSize: 16, lineHeight: 23, fontWeight: '700', color: colors.text, marginBottom: 8 },
  option: { minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, paddingHorizontal: 10, paddingVertical: 8, marginTop: 7 },
  optionSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  optionNum: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface2, color: colors.textSecondary, textAlign: 'center', textAlignVertical: 'center', fontSize: 12, fontWeight: '700', overflow: 'hidden', paddingTop: 4 },
  optionNumSelected: { backgroundColor: colors.primary, color: colors.onPrimary },
  optionText: { flex: 1, color: colors.textSecondary, fontSize: 14 },
  optionTextSelected: { color: colors.text, fontWeight: '600' },
  input: { minHeight: 64, maxHeight: 110, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface, paddingHorizontal: 12, paddingVertical: 10, color: colors.text, fontSize: 15, lineHeight: 20, textAlignVertical: 'top', marginTop: 8 },
  note: { minHeight: 64 },
  review: { gap: 9 },
  reviewRow: { borderBottomWidth: 1, borderBottomColor: colors.border, paddingVertical: 7, gap: 3 },
  reviewQuestion: { fontSize: 13, fontWeight: '700', color: colors.text },
  reviewAnswer: { fontSize: 13, color: colors.textSecondary },
  count: { fontSize: 12, color: colors.muted },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 3 },
  pushRight: { marginLeft: 'auto' },
  secondary: { minHeight: 40, flexDirection: 'row', alignItems: 'center', gap: 2, paddingHorizontal: 10, borderWidth: 1, borderColor: colors.border, borderRadius: 10, backgroundColor: colors.surface },
  secondaryText: { color: colors.textSecondary, fontWeight: '600', fontSize: 13 },
  primary: { minHeight: 40, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, paddingHorizontal: 14, borderRadius: 10, backgroundColor: colors.primary },
  primaryText: { color: colors.onPrimary, fontWeight: '700', fontSize: 13 },
  disabled: { opacity: 0.55 },
})
