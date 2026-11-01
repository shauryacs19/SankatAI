// Health timeline: AI assessments, report uploads/analyses, medicines read from
// reports and symptom entries, newest first, grouped by day, filterable.
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { Activity, FileText, History, MessageSquare, Pill } from 'lucide-react-native'
import { sevColor } from '../../theme'
import { useChat } from '../../context/ChatContext'
import usePullRefresh from '../../components/usePullRefresh'
import { errText } from '../../lib/errText'
import { getTimeline } from '../../lib/health'
import { Badge, Empty, ErrorBox, Loading, useStyles } from './parts'

const CATS = [
  { value: 'assessment', label: 'AI checks', Icon: MessageSquare },
  { value: 'report', label: 'Reports', Icon: FileText },
  { value: 'symptom', label: 'Symptoms', Icon: Activity },
  { value: 'medication', label: 'Medicines', Icon: Pill },
]
const ICON = Object.fromEntries(CATS.map((c) => [c.value, c.Icon]))
const SEV = { LOW: 'Low risk', MODERATE: 'Moderate risk', HIGH: 'High risk', EMERGENCY: 'Emergency' }
const day = (iso) => new Date(iso).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
const time = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

export default function TimelineView({ navigation, onOpenReport }) {
  const { colors, styles } = useStyles()
  const { select } = useChat()
  const [selected, setSelected] = useState([])
  const [events, setEvents] = useState(null)
  const [error, setError] = useState('')

  const load = useCallback(() => getTimeline(selected)
    .then((r) => { setEvents(r.events); setError('') })
    .catch((err) => setError(errText(err, 'Could not load your timeline.'))), [selected])
  useEffect(() => {
    getTimeline(selected).then((r) => { setEvents(r.events); setError('') }).catch((err) => setError(errText(err, 'Could not load your timeline.')))
  }, [selected])
  const refreshControl = usePullRefresh(load)

  const groups = useMemo(() => {
    const map = new Map()
    for (const e of events || []) { const k = day(e.at); if (!map.has(k)) map.set(k, []); map.get(k).push(e) }
    return [...map.entries()]
  }, [events])

  const filter = (next) => { setEvents(null); setSelected(next) }
  const toggle = (v) => filter(selected.includes(v) ? selected.filter((x) => x !== v) : [...selected, v])
  const openChat = (cid) => { select(cid); navigation?.navigate?.('Chat') }

  return (
    <ScrollView contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
      <View style={styles.chipRow} accessibilityRole="radiogroup" accessibilityLabel="Filter by category">
        <TouchableOpacity style={[styles.chip, !selected.length && styles.chipOn]} onPress={() => filter([])} accessibilityState={{ selected: !selected.length }}>
          <Text style={[styles.chipText, !selected.length && styles.chipTextOn]}>All</Text>
        </TouchableOpacity>
        {CATS.map((c) => {
          const on = selected.includes(c.value)
          return (
            <TouchableOpacity key={c.value} style={[styles.chip, on && styles.chipOn]} onPress={() => toggle(c.value)} accessibilityState={{ selected: on }}>
              <c.Icon size={14} color={on ? colors.primary : colors.textSecondary} /><Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
            </TouchableOpacity>
          )
        })}
      </View>

      {error ? <ErrorBox message={error} onRetry={load} />
        : events === null ? <Loading />
          : events.length === 0 ? (
            <Empty Icon={History} title={selected.length ? 'Nothing in these categories yet' : 'Your timeline is empty'}
              text="Chats with SankatAI, uploaded reports and the symptoms you record appear here in date order." />
          ) : groups.map(([label, items]) => (
            <View key={label} style={{ gap: 7 }}>
              <Text style={styles.groupLabel}>{label}</Text>
              <View style={styles.listCard}>
                {items.map((e, i) => {
                  const Icon = ICON[e.category] || FileText
                  const d = e.details || {}
                  return (
                    <View key={e.id} style={[styles.row, i > 0 && styles.rowBorder]}>
                      <View style={styles.rowIcon}><Icon size={15} color={e.severity ? sevColor(e.severity) : colors.textSecondary} /></View>
                      <View style={styles.rowCopy}>
                        <Text style={styles.rowTitle}>{e.title}</Text>
                        <Text style={styles.muted}>{time(e.at)}{e.severity ? ` · ${SEV[e.severity] || e.severity}` : ''}</Text>
                        {!!d.notes && <Text style={styles.muted}>{d.notes}</Text>}
                        {d.kind === 'analysis' && <Text style={styles.muted}>{d.summary}{d.abnormalCount > 0 ? ` ${d.abnormalCount} outside printed range.` : ''}</Text>}
                        {!!d.medications && <Text style={styles.muted}>{d.medications.join(' · ')}</Text>}
                        {e.category === 'assessment' && <TouchableOpacity onPress={() => openChat(d.consultationId)}><Text style={styles.link}>Open chat</Text></TouchableOpacity>}
                        {(d.kind === 'analysis' || e.category === 'medication') && <TouchableOpacity onPress={() => onOpenReport(d.attachmentId)}><Text style={styles.link}>View analysis</Text></TouchableOpacity>}
                      </View>
                      {e.severity === 'EMERGENCY' && <Badge tone="danger">Emergency</Badge>}
                    </View>
                  )
                })}
              </View>
            </View>
          ))}
    </ScrollView>
  )
}
