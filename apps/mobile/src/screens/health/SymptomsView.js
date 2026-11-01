// Symptom progression tracker: record name, severity 1-10, date/time and notes;
// each symptom shows a chart, its entries and the computed trend, plus an
// optional AI wording of that trend.
import { useCallback, useEffect, useState } from 'react'
import { Alert, ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import Svg, { Circle, Line, Polyline, Text as SvgText } from 'react-native-svg'
import { Activity, AlertTriangle, Plus, Sparkles, Trash2 } from 'lucide-react-native'
import { Field } from '../../components/FormControls'
import DateField from '../../components/DateField'
import { useToast } from '../../components/Toast'
import usePullRefresh from '../../components/usePullRefresh'
import { errText } from '../../lib/errText'
import { addSymptom, deleteSymptom, listSymptoms, summarizeSymptom } from '../../lib/health'
import { Badge, Empty, ErrorBox, Loading, fmtDateTime, useStyles } from './parts'

const TREND = {
  increasing: { label: 'Ratings increasing', tone: 'warn' },
  decreasing: { label: 'Ratings decreasing', tone: 'neutral' },
  stable: { label: 'Ratings stable', tone: 'neutral' },
  insufficient: { label: 'Not enough entries for a trend', tone: 'neutral' },
}
const pad = (n) => String(n).padStart(2, '0')
const today = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}` }
const nowTime = () => { const t = new Date(); return `${pad(t.getHours())}:${pad(t.getMinutes())}` }
const short = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

// Severity over time: one series, time-scaled x, fixed 1-10 y.
function SeverityChart({ name, entries }) {
  const { colors } = useStyles()
  const W = 320, H = 150, L = 24, R = 10, T = 10, B = 22
  const times = entries.map((e) => new Date(e.recordedAt).getTime())
  const t0 = Math.min(...times), t1 = Math.max(...times)
  const x = (t) => (t1 === t0 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R))
  const y = (v) => T + ((10 - v) / 9) * (H - T - B)
  const pts = entries.map((e, i) => ({ id: e.id, cx: x(times[i]), cy: y(e.severity) }))
  return (
    <View accessible accessibilityRole="image" accessibilityLabel={`${name} severity over time, ${entries.length} entries, latest ${entries.at(-1).severity} out of 10`}>
      <Svg width="100%" height={H} viewBox={`0 0 ${W} ${H}`}>
        {[1, 4, 7, 10].map((v) => (
          <Line key={`g${v}`} x1={L} x2={W - R} y1={y(v)} y2={y(v)} stroke={colors.border} strokeWidth={1} />
        ))}
        {[1, 4, 7, 10].map((v) => <SvgText key={`t${v}`} x={L - 6} y={y(v) + 4} fontSize={10} fill={colors.muted} textAnchor="end">{v}</SvgText>)}
        <SvgText x={L} y={H - 5} fontSize={10} fill={colors.muted}>{short(entries[0].recordedAt)}</SvgText>
        {entries.length > 1 && <SvgText x={W - R} y={H - 5} fontSize={10} fill={colors.muted} textAnchor="end">{short(entries.at(-1).recordedAt)}</SvgText>}
        {pts.length > 1 && <Polyline points={pts.map((p) => `${p.cx},${p.cy}`).join(' ')} fill="none" stroke={colors.primary} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
        {pts.map((p) => <Circle key={p.id} cx={p.cx} cy={p.cy} r={4} fill={colors.primary} stroke={colors.surface} strokeWidth={2} />)}
      </Svg>
    </View>
  )
}

function SymptomCard({ series, onDelete }) {
  const { colors, styles } = useStyles()
  const toast = useToast()
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(false)
  const t = series.trend
  const trend = TREND[t.direction] || TREND.insufficient
  const summarize = async () => {
    setBusy(true)
    try { setSummary(await summarizeSymptom(series.name)) } catch (err) { toast.error(errText(err, 'Could not summarise this trend.')) }
    setBusy(false)
  }
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}><Activity size={17} color={colors.primary} /><Text style={styles.cardTitle}>{series.name}</Text></View>
      <Badge tone={trend.tone}>{trend.label}</Badge>
      <Text style={styles.muted}>{t.count} entr{t.count === 1 ? 'y' : 'ies'} · latest {t.latest}/10{t.change != null ? ` · average change ${t.change > 0 ? '+' : ''}${t.change} points` : ''}</Text>
      <SeverityChart name={series.name} entries={series.entries} />
      <View>
        {[...series.entries].reverse().map((e) => (
          <View key={e.id} style={styles.entry}>
            <Text style={styles.entrySev}>{e.severity}/10</Text>
            <Text style={[styles.muted, { flex: 1 }]}>{fmtDateTime(e.recordedAt)}{e.notes ? ` — ${e.notes}` : ''}</Text>
            <TouchableOpacity onPress={() => onDelete(e)} hitSlop={10} accessibilityLabel={`Delete ${series.name} entry from ${fmtDateTime(e.recordedAt)}`}><Trash2 size={16} color={colors.muted} /></TouchableOpacity>
          </View>
        ))}
      </View>
      {series.entries.length > 1 && !summary && (
        <TouchableOpacity style={[styles.ghostBtn, { alignSelf: 'flex-start' }]} onPress={summarize} disabled={busy}>
          {busy ? <ActivityIndicator color={colors.primary} /> : <Sparkles size={15} color={colors.textSecondary} />}<Text style={styles.ghostText}>{busy ? 'Summarising…' : 'Summarise trend'}</Text>
        </TouchableOpacity>
      )}
      {summary && (
        <View style={styles.summary} accessibilityLiveRegion="polite">
          <Text style={styles.text}>{summary.summary}</Text>
          <Text style={styles.note}>{summary.source === 'ai' ? 'AI summary. ' : ''}{summary.disclaimer}</Text>
        </View>
      )}
    </View>
  )
}

export default function SymptomsView() {
  const { colors, styles } = useStyles()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', severity: 5, date: today(), time: nowTime(), notes: '' })
  const [formError, setFormError] = useState({})
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => listSymptoms().then((r) => { setData(r); setError('') })
    .catch((err) => setError(errText(err, 'Could not load your symptoms.'))), [])
  useEffect(() => { listSymptoms().then(setData).catch((err) => setError(errText(err, 'Could not load your symptoms.'))) }, [])
  const refreshControl = usePullRefresh(load)

  const submit = async () => {
    const errs = {}
    if (!form.name.trim()) errs.name = 'Enter the symptom, for example “headache”.'
    const m = /^([01]?\d|2[0-3]):([0-5]\d)$/.exec(form.time.trim())
    const when = m ? new Date(`${form.date}T${pad(m[1])}:${m[2]}:00`) : null
    if (!when || Number.isNaN(when.getTime())) errs.when = 'Enter the time as HH:MM, for example 08:30.'
    else if (when.getTime() > Date.now() + 5 * 60000) errs.when = "The date and time can't be in the future."
    setFormError(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      await addSymptom({ name: form.name.trim(), severity: form.severity, recordedAt: when.toISOString(), notes: form.notes.trim() })
      toast.success('Symptom recorded.')
      setForm((f) => ({ ...f, notes: '', date: today(), time: nowTime() }))
      await load()
    } catch (err) { toast.error(errText(err, 'Could not save this entry.')) }
    setSaving(false)
  }

  const confirmDelete = (e) => Alert.alert('Delete this entry?', `${e.name}, ${e.severity}/10 on ${fmtDateTime(e.recordedAt)}.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Delete', style: 'destructive', onPress: async () => {
      try { await deleteSymptom(e.id); toast.success('Entry deleted.'); await load() } catch (err) { toast.error(errText(err, 'Could not delete this entry.')) }
    } },
  ])

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.cardHead}><Plus size={17} color={colors.primary} /><Text style={styles.cardTitle}>Record a symptom</Text></View>
          <Field label="Symptom *" value={form.name} onChangeText={(v) => setForm({ ...form, name: v })} maxLength={60} placeholder="e.g. Headache" error={formError.name} />
          <Text style={styles.label}>Severity: {form.severity}/10 (1 = very mild, 10 = worst)</Text>
          <View style={styles.sevRow} accessibilityRole="radiogroup" accessibilityLabel="Severity">
            {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => {
              const on = form.severity === n
              return (
                <TouchableOpacity key={n} style={[styles.sevBtn, on && styles.sevBtnOn]} onPress={() => setForm({ ...form, severity: n })}
                  accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`${n} out of 10`}>
                  <Text style={[styles.sevText, on && styles.sevTextOn]}>{n}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
          <View style={styles.twoCol}>
            <View style={{ flex: 1.4 }}><DateField label="Date" value={form.date} onChange={(v) => setForm({ ...form, date: v })} /></View>
            <View style={{ flex: 1 }}><Field label="Time" value={form.time} onChangeText={(v) => setForm({ ...form, time: v })} maxLength={5} keyboardType="numbers-and-punctuation" placeholder="HH:MM" /></View>
          </View>
          {!!formError.when && <Text style={styles.fieldErr}>{formError.when}</Text>}
          <Field label="Notes (optional)" value={form.notes} onChangeText={(v) => setForm({ ...form, notes: v })} maxLength={500} multiline placeholder="What makes it better or worse? Any medicine taken?" />
          {form.severity >= 8 && (
            <View style={styles.alert}><AlertTriangle size={15} color={colors.warning} /><Text style={[styles.text, { flex: 1 }]}>A severe or suddenly worse symptom needs a doctor. If it is an emergency, call 112.</Text></View>
          )}
          <TouchableOpacity style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Plus size={16} color={colors.onPrimary} />}<Text style={styles.primaryText}>{saving ? 'Saving…' : 'Add entry'}</Text>
          </TouchableOpacity>
        </View>

        {error ? <ErrorBox message={error} onRetry={load} />
          : data === null ? <Loading />
            : data.symptoms.length === 0 ? <Empty Icon={Activity} title="No symptoms recorded yet" text="Add an entry each day to see how a symptom changes over time." />
              : data.symptoms.map((s) => <SymptomCard key={s.name.toLowerCase()} series={s} onDelete={confirmDelete} />)}
        <Text style={styles.note}>Trends describe the ratings you entered. A change in ratings does not confirm that a condition is improving or getting worse.</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  )
}
