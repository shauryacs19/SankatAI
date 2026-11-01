// AI medical report analyzer: lists Documents-vault files, starts an analysis
// (background job on the server, polled here) and shows each result with the
// printed reference range and the flag the server computed.
import { useCallback, useEffect, useRef, useState } from 'react'
import { ActivityIndicator, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, FileText, Lock, Minus, Sparkles, Upload } from 'lucide-react-native'
import { useToast } from '../../components/Toast'
import usePullRefresh from '../../components/usePullRefresh'
import { errText } from '../../lib/errText'
import { analyzeReport, getReport, listReports } from '../../lib/health'
import { Badge, Empty, ErrorBox, Loading, fmtDate, useStyles } from './parts'

const POLL_MS = 2500
const POLL_LIMIT = 48 // ~2 minutes
const STATUS = {
  high: { label: 'High', Icon: ArrowUp, tone: 'warn' },
  low: { label: 'Low', Icon: ArrowDown, tone: 'warn' },
  normal: { label: 'In range', Icon: CheckCircle2, tone: 'ok' },
  not_assessed: { label: 'Not assessed', Icon: Minus, tone: 'neutral' },
}
const isAbnormal = (p) => p.status === 'high' || p.status === 'low'

function StatusBadge({ report }) {
  const { colors } = useStyles()
  if (report.status === 'processing') return <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}><ActivityIndicator size="small" color={colors.primary} /><Badge>Analysing…</Badge></View>
  if (report.status === 'failed') return <Badge tone="danger" Icon={AlertTriangle}>Failed</Badge>
  if (report.status === 'ready') return report.abnormalCount > 0 ? <Badge tone="warn" Icon={AlertTriangle}>{report.abnormalCount} outside range</Badge> : <Badge tone="ok" Icon={CheckCircle2}>Analysed</Badge>
  return null
}

function AnalysisView({ report }) {
  const { colors, styles } = useStyles()
  const a = report.analysis
  const sorted = [...a.parameters].sort((x, y) => Number(isAbnormal(y)) - Number(isAbnormal(x)))
  return (
    <View style={styles.card}>
      <View style={styles.cardHead}><FileText size={17} color={colors.primary} /><Text style={styles.cardTitle}>{report.filename}</Text></View>
      <Text style={styles.muted}>{[a.reportType, a.reportDate && `Report date ${a.reportDate}`, `Analysed ${fmtDate(report.analyzedAt)}`].filter(Boolean).join(' · ')}</Text>
      <Text style={styles.text}>{a.summary}</Text>
      {a.parameters.length === 0 ? <Text style={styles.muted}>No test values could be read from this document.</Text> : (
        <View>
          {sorted.map((p, i) => {
            const s = STATUS[p.status] || STATUS.not_assessed
            return (
              <View key={`${p.name}-${i}`} style={[styles.param, i > 0 && styles.rowBorder, isAbnormal(p) && styles.paramAbnormal]}>
                <View style={styles.paramTop}><Text style={styles.paramName}>{p.name}</Text><Badge tone={s.tone} Icon={s.Icon}>{s.label}</Badge></View>
                <Text style={styles.text}>{p.value} {p.unit}<Text style={styles.muted}>   Printed range: {p.referenceRange || 'not stated in report'}</Text></Text>
                {!!p.explanation && <Text style={styles.muted}>{p.explanation}</Text>}
              </View>
            )
          })}
        </View>
      )}
      {a.medications?.length > 0 && <View><Text style={styles.label}>Medicines listed</Text>{a.medications.map((m) => <Text key={m} style={styles.text}>•  {m}</Text>)}</View>}
      {!a.verifiedAgainstText && <View style={[styles.alert, styles.alertInfo]}><Text style={[styles.text, { flex: 1 }]}>Read from a photo by AI. Check each value against the original report.</Text></View>}
      <Text style={styles.note}>{report.disclaimer}</Text>
    </View>
  )
}

export default function ReportsView({ navigation, openId, onOpened }) {
  const { colors, styles } = useStyles()
  const toast = useToast()
  const [reports, setReports] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null)
  const [opening, setOpening] = useState(null)
  const polls = useRef({})
  const scrollRef = useRef(null)

  const replace = (r) => setReports((list) => (list || []).map((x) => (x.attachmentId === r.attachmentId ? { ...x, ...r } : x)))
  const load = useCallback(() => listReports().then((r) => { setReports(r.reports); setError('') })
    .catch((err) => setError(errText(err, 'Could not load your documents.'))), [])
  useEffect(() => { listReports().then((r) => setReports(r.reports)).catch((err) => setError(errText(err, 'Could not load your documents.'))) }, [])
  useEffect(() => () => Object.values(polls.current).forEach(clearTimeout), [])
  const refreshControl = usePullRefresh(load)

  const show = (r) => { setSelected(r); setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 150) }
  const open = async (id) => {
    setOpening(id)
    try { const r = await getReport(id); replace(r); if (r.status === 'ready') show(r) } catch (err) { toast.error(errText(err, 'Could not open this analysis.')) }
    setOpening(null)
  }
  // Deep link from the timeline.
  useEffect(() => {
    if (!openId) return
    getReport(openId).then((r) => { if (r.status === 'ready') show(r) }).catch((err) => toast.error(errText(err, 'Could not open this analysis.')))
    onOpened?.()
  }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps -- once per link

  const poll = (id, n = 0) => {
    polls.current[id] = setTimeout(async () => {
      try {
        const r = await getReport(id)
        replace(r)
        if (r.status === 'processing' && n < POLL_LIMIT) return poll(id, n + 1)
        if (r.status === 'ready') { show(r); toast.success('Report analysed.') }
        else if (r.status === 'failed') toast.error(r.error || 'The report could not be analysed.')
        else toast.error('The analysis is taking too long. Pull down to check again.')
      } catch (err) { toast.error(errText(err, 'Lost track of the analysis. Pull down to refresh.')) }
    }, POLL_MS)
  }
  // Follow an analysis that was already running when this view opened.
  useEffect(() => {
    for (const r of reports || []) if (r.status === 'processing' && !polls.current[r.attachmentId]) poll(r.attachmentId)
  }, [reports]) // eslint-disable-line react-hooks/exhaustive-deps -- poll only reads refs + setters

  const analyse = async (id) => {
    try { const r = await analyzeReport(id); replace(r); setSelected(null); poll(id) } catch (err) { toast.error(errText(err, 'Could not start the analysis.')) }
  }

  const upload = <TouchableOpacity style={styles.ghostBtn} onPress={() => navigation?.navigate?.('Documents')}><Upload size={15} color={colors.textSecondary} /><Text style={styles.ghostText}>Upload a report</Text></TouchableOpacity>

  if (error) return <ErrorBox message={error} onRetry={load} />
  if (reports === null) return <Loading />
  return (
    <ScrollView ref={scrollRef} contentContainerStyle={styles.scroll} refreshControl={refreshControl}>
      <View style={styles.card}>
        <View style={styles.cardHead}><Sparkles size={17} color={colors.primary} /><Text style={styles.cardTitle}>Your medical reports</Text></View>
        <Text style={styles.muted}>Upload a lab report (PDF or photo) in Documents, then analyse it here. Values are compared only with the reference ranges printed on the report.</Text>
        {reports.length === 0 ? <Empty Icon={FileText} title="No documents yet" text="Upload a blood test or other lab report to get a plain-language explanation." action={upload} /> : (
          <>
            <View style={{ alignSelf: 'flex-start' }}>{upload}</View>
            {reports.map((r, i) => (
              <View key={r.attachmentId} style={[styles.row, { paddingHorizontal: 0 }, i > 0 && styles.rowBorder]}>
                <FileText size={18} color={colors.textSecondary} style={{ marginTop: 2 }} />
                <View style={styles.rowCopy}>
                  <Text style={[styles.rowTitle, selected?.attachmentId === r.attachmentId && { color: colors.primary }]} numberOfLines={1}>{r.filename}</Text>
                  <Text style={styles.muted}>Uploaded {fmtDate(r.uploadedAt)}</Text>
                  <StatusBadge report={r} />
                  {r.status === 'failed' && !!r.error && <Text style={styles.note}>{r.error}</Text>}
                </View>
                {r.passwordProtected ? <Badge Icon={Lock}>PIN-protected</Badge>
                  : r.status === 'ready' ? (
                    <View style={{ gap: 6 }}>
                      <TouchableOpacity style={styles.ghostBtn} onPress={() => open(r.attachmentId)} disabled={opening === r.attachmentId}>
                        {opening === r.attachmentId ? <ActivityIndicator color={colors.primary} /> : <Text style={styles.ghostText}>View</Text>}
                      </TouchableOpacity>
                      <TouchableOpacity onPress={() => analyse(r.attachmentId)}><Text style={[styles.link, { textAlign: 'center' }]}>Re-analyse</Text></TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity style={[styles.primaryBtn, { minHeight: 38 }, r.status === 'processing' && { opacity: 0.5 }]} disabled={r.status === 'processing'} onPress={() => analyse(r.attachmentId)}>
                      <Text style={styles.primaryText}>{r.status === 'failed' ? 'Try again' : 'Analyse'}</Text>
                    </TouchableOpacity>
                  )}
              </View>
            ))}
          </>
        )}
      </View>
      {selected && <AnalysisView report={selected} />}
    </ScrollView>
  )
}
