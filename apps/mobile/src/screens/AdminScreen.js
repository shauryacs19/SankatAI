// Admin console (web parity: features/admin). Aggregated, pseudonymous platform
// analytics + admin access management. The entry is shown only to accounts whose
// token carries the ADMIN group — UX only: the backend authorises every call
// (API Gateway JWT + access-token re-verification + ADMIN group + admins row).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet, ActivityIndicator, Alert, Share, RefreshControl } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import {
  ArrowLeft, RefreshCw, Shield, LayoutDashboard, BarChart3, Users, ThumbsUp, HeartPulse, UserCog, ScrollText,
  AlertTriangle, CheckCircle2, XCircle, CircleSlash, Download, MailPlus, UserMinus,
} from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { useToast } from '../components/Toast'
import { errText } from '../lib/errText'
import { refreshSession } from '../lib/cognito'
import {
  getAdminAnalytics, exportAdminAnalyticsCsv, getAdminUsers, getAdminFeedback, getSystemHealth,
  listAdmins, removeAdmin, listInvitations, createInvitation, revokeInvitation, getAuditLogs,
} from '../lib/api'
import {
  PRESETS, toRange, validateCustom, analyticsToday, fmt, fmtMs, fmtPct, fmtTime, labelFor, SERIES, hasPoints,
} from '../lib/adminFormat'

const SECTIONS = [
  { key: 'overview', label: 'Overview', Icon: LayoutDashboard, ranged: true },
  { key: 'analytics', label: 'Analytics', Icon: BarChart3, ranged: true },
  { key: 'users', label: 'Users', Icon: Users, ranged: true },
  { key: 'feedback', label: 'Feedback', Icon: ThumbsUp, ranged: true },
  { key: 'health', label: 'System Health', Icon: HeartPulse },
  { key: 'access', label: 'Admin Access', Icon: UserCog },
  { key: 'audit', label: 'Audit Logs', Icon: ScrollText },
]
const SEVERITIES = [['EMERGENCY', 'Emergency'], ['HIGH', 'High'], ['MODERATE', 'Moderate'], ['LOW', 'Low']]
const GMAIL = /^[a-z0-9._%+-]+@gmail\.com$/
const GROUP_W = 18

// { data, loading, refreshing, error, reload } — a superseded request never
// overwrites newer data (same contract as web useAdminResource).
function useResource(loader, deps) {
  const [data, setData] = useState(null)
  const [refreshing, setRefreshing] = useState(false)
  const [error, setError] = useState(null)
  const seq = useRef(0)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const load = useCallback(loader, deps)
  const reload = useCallback(async () => {
    const id = ++seq.current
    setRefreshing(true); setError(null)
    try { const r = await load(); if (id === seq.current) setData(r) } catch (e) { if (id === seq.current) setError(e) } finally { if (id === seq.current) setRefreshing(false) }
  }, [load])
  useEffect(() => { reload() }, [reload])
  return { data, refreshing, error, reload }
}

export default function AdminScreen({ navigation }) {
  const { colors, sev, scheme } = useTheme()
  const styles = makeStyles(colors)
  const toast = useToast()
  const [section, setSection] = useState('overview')
  const [preset, setPreset] = useState('30d')
  const [custom, setCustom] = useState({ from: '', to: '' })
  const [applied, setApplied] = useState({ from: '', to: '' })
  const [customError, setCustomError] = useState('')
  const [refreshKey, setRefreshKey] = useState(0)
  const range = useMemo(() => toRange({ preset, ...applied }), [preset, applied])
  const ranged = SECTIONS.find((s) => s.key === section)?.ranged
  const ctx = { range, refreshKey, styles, colors, sev, series: SERIES[scheme] || SERIES.light, toast, navigation }

  const choose = (v) => {
    setPreset(v); setCustomError('')
    if (v === 'custom' && !applied.from) { const t = analyticsToday(); setCustom({ from: t, to: t }) }
  }
  const applyCustom = () => {
    const problem = validateCustom(custom.from.trim(), custom.to.trim())
    setCustomError(problem)
    if (!problem) setApplied({ from: custom.from.trim(), to: custom.to.trim() })
  }

  const Page = { overview: Overview, analytics: Analytics, users: UsersPage, feedback: FeedbackPage, health: Health, access: Access, audit: Audit }[section]

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.top}>
        <TouchableOpacity onPress={() => navigation.goBack()} hitSlop={10} accessibilityLabel="Back to the app"><ArrowLeft size={22} color={colors.text} /></TouchableOpacity>
        <View style={styles.titleIc}><Shield size={16} color={colors.primary} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title} accessibilityRole="header">Sankat.AI Admin</Text>
          <Text style={styles.sub}>Platform analytics and administration</Text>
        </View>
        <TouchableOpacity style={styles.iconBtn} onPress={() => setRefreshKey((k) => k + 1)} accessibilityLabel="Refresh"><RefreshCw size={16} color={colors.text} /></TouchableOpacity>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.navScroll} contentContainerStyle={styles.nav}>
        {SECTIONS.map(({ key, label, Icon }) => {
          const on = key === section
          return (
            <TouchableOpacity key={key} style={[styles.navItem, on && styles.navItemOn]} onPress={() => setSection(key)}
              accessibilityRole="tab" accessibilityState={{ selected: on }}>
              <Icon size={14} color={on ? colors.primary : colors.muted} />
              <Text style={[styles.navText, on && { color: colors.primary }]}>{label}</Text>
            </TouchableOpacity>
          )
        })}
      </ScrollView>

      <ScrollView contentContainerStyle={styles.main} keyboardShouldPersistTaps="handled"
        refreshControl={<RefreshControl refreshing={false} onRefresh={() => setRefreshKey((k) => k + 1)} tintColor={colors.primary} colors={[colors.primary]} />}>
        <Text style={styles.scope}>Platform analytics only: aggregated, pseudonymous counts. No patient records, messages or documents are shown here.</Text>

        {ranged && (
          <View style={styles.filters}>
            <View style={styles.seg} accessibilityRole="radiogroup">
              {PRESETS.map((p) => (
                <TouchableOpacity key={p.value} style={[styles.segItem, preset === p.value && styles.segOn]} onPress={() => choose(p.value)}
                  accessibilityRole="radio" accessibilityState={{ checked: preset === p.value }}>
                  <Text style={[styles.segText, preset === p.value && { color: colors.primary }]}>{p.label}</Text>
                </TouchableOpacity>
              ))}
            </View>
            {preset === 'custom' && (
              <View style={styles.customRow}>
                <TextInput style={styles.dateInput} value={custom.from} onChangeText={(v) => setCustom((c) => ({ ...c, from: v }))} placeholder="From YYYY-MM-DD" placeholderTextColor={colors.muted} accessibilityLabel="From date" />
                <TextInput style={styles.dateInput} value={custom.to} onChangeText={(v) => setCustom((c) => ({ ...c, to: v }))} placeholder="To YYYY-MM-DD" placeholderTextColor={colors.muted} accessibilityLabel="To date" />
                <TouchableOpacity style={styles.btnSecondary} onPress={applyCustom}><Text style={styles.btnSecondaryText}>Apply</Text></TouchableOpacity>
              </View>
            )}
            <Text style={styles.rangeNote}>{range.from === range.to ? range.from : `${range.from} → ${range.to}`} · IST{range.granularity === 'hour' ? ' · hourly' : ''}</Text>
            {!!customError && <Text style={styles.warn}>{customError}</Text>}
          </View>
        )}

        <Page {...ctx} />
      </ScrollView>
    </SafeAreaView>
  )
}

// ── shared pieces ───────────────────────────────────────────────────────────

function LoadError({ error, onRetry, retrying, styles, colors }) {
  const forbidden = error?.status === 403
  return (
    <View style={styles.state}>
      <AlertTriangle size={28} color={colors.muted} />
      <Text style={styles.stateTitle}>{forbidden ? 'Admin access required' : 'Couldn’t load this page'}</Text>
      <Text style={styles.stateText}>{forbidden ? 'Your account no longer has admin access. If this is unexpected, ask another admin.' : errText(error, 'Something went wrong while loading. Try again.')}</Text>
      {!forbidden && (
        <TouchableOpacity style={styles.btnSecondary} onPress={onRetry} disabled={retrying}>
          {retrying ? <ActivityIndicator color={colors.text} size="small" /> : <Text style={styles.btnSecondaryText}>Try again</Text>}
        </TouchableOpacity>
      )}
    </View>
  )
}
const Loading = ({ styles, colors }) => <View style={styles.state}><ActivityIndicator color={colors.primary} /><Text style={styles.stateText}>Loading…</Text></View>
const Gate = ({ r, styles, colors, children }) => {
  if (!r.data) return r.error ? <LoadError error={r.error} onRetry={r.reload} retrying={r.refreshing} styles={styles} colors={colors} /> : <Loading styles={styles} colors={colors} />
  return <View style={[{ gap: 14 }, r.refreshing && { opacity: 0.6 }]}>{children(r.data)}</View>
}

// KPI tile. A metric the platform doesn't record says "Unavailable" with the reason — never a made-up 0.
function Metric({ title, metric, format = fmt, hint, styles }) {
  const unavailable = metric == null || metric.value == null
  const note = unavailable ? metric?.unavailable || 'Not recorded.' : metric?.note || (metric?.partialSince ? `Since ${metric.partialSince} (tracking start)` : hint)
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{title}</Text>
      <Text style={[styles.metricValue, unavailable && styles.unavailable]}>{unavailable ? 'Unavailable' : format(metric.value)}</Text>
      {!!note && <Text style={styles.metricNote}>{note}</Text>}
    </View>
  )
}
const Metrics = ({ children, styles }) => <View style={styles.metrics}>{children}</View>

function Card({ title, description, children, styles }) {
  return (
    <View style={styles.card}>
      {!!title && <Text style={styles.cardTitle} accessibilityRole="header">{title}</Text>}
      {!!description && <Text style={styles.cardDesc}>{description}</Text>}
      {children}
    </View>
  )
}

function NoData({ description, styles, title = 'No data for this range' }) {
  return <View style={styles.noData}><Text style={styles.noDataTitle}>{title}</Text>{!!description && <Text style={styles.stateText}>{description}</Text>}</View>
}

// Horizontal bars: label + value as text, so meaning never depends on colour.
function BarList({ items, styles, color, format = fmt }) {
  const max = Math.max(1, ...items.map((i) => (typeof i.value === 'number' ? i.value : 0)))
  return (
    <View style={{ gap: 10 }}>
      {items.map((it) => {
        const has = typeof it.value === 'number'
        return (
          <View key={it.key} accessibilityLabel={`${it.label}: ${has ? format(it.value) : 'Unavailable'}`}>
            <View style={styles.barHead}><Text style={styles.barLabel}>{it.label}</Text><Text style={[styles.barValue, !has && styles.unavailable]}>{has ? format(it.value) : 'Unavailable'}</Text></View>
            <View style={styles.track}>{has && it.value > 0 && <View style={{ width: `${(it.value / max) * 100}%`, height: '100%', borderRadius: 99, backgroundColor: it.color || color }} />}</View>
            {!has && !!it.unavailable && <Text style={styles.metricNote}>{it.unavailable}</Text>}
          </View>
        )
      })}
    </View>
  )
}

// Grouped column chart (no chart lib). Null points are gaps ("Not recorded"), never 0.
function MiniChart({ labels, series, styles, colors }) {
  const max = Math.max(1, ...series.flatMap((s) => s.values.map((v) => (typeof v === 'number' ? v : 0))))
  const H = 120
  const step = Math.max(1, Math.ceil(labels.length / 6))
  const summary = series.map((s) => `${s.label}: total ${fmt(s.values.reduce((a, v) => a + (v || 0), 0))}`).join('; ')
  return (
    <View accessibilityLabel={summary}>
      {series.length > 1 && (
        <View style={styles.legend}>
          {series.map((s) => <View key={s.key} style={styles.legendItem}><View style={[styles.legendDot, { backgroundColor: s.color }]} /><Text style={styles.legendText}>{s.label}</Text></View>)}
        </View>
      )}
      <ScrollView horizontal showsHorizontalScrollIndicator={false}>
        <View>
          <View style={[styles.chart, { height: H }]}>
            {labels.map((t, i) => (
              <View key={t} style={styles.group}>
                {series.map((s) => {
                  const v = s.values[i]
                  return v == null
                    ? <View key={s.key} style={[styles.col, { height: 2, backgroundColor: colors.border }]} />
                    : <View key={s.key} style={[styles.col, { height: Math.max(2, (v / max) * (H - 4)), backgroundColor: s.color }]} />
                })}
              </View>
            ))}
          </View>
          <View style={styles.axis}>
            {labels.map((t, i) => (
              <View key={t} style={styles.axisCell}>
                {i % step === 0 && <Text style={styles.axisText} numberOfLines={1}>{labelFor(t)}</Text>}
              </View>
            ))}
          </View>
        </View>
      </ScrollView>
      <Text style={styles.metricNote}>Peak {fmt(max)} · {summary}</Text>
    </View>
  )
}

// ── sections ────────────────────────────────────────────────────────────────

function Overview({ range, refreshKey, styles, colors, series }) {
  const r = useResource(() => getAdminAnalytics(range), [range, refreshKey])
  return (
    <Gate r={r} styles={styles} colors={colors}>{(data) => {
      const { labels } = data.range
      const u = data.users.series; const ai = data.ai.series; const fb = data.feedback.series
      const newUsers = u.map((p) => p.new); const active = u.map((p) => p.active)
      const responses = ai.map((p) => p.responses); const failed = ai.map((p) => p.failed); const requests = ai.map((p) => p.requests)
      const ups = fb.map((p) => p.up); const downs = fb.map((p) => p.down)
      const k = data.kpis
      const item = (key, label, m) => ({ key, label, value: m?.value ?? null, unavailable: m?.unavailable })
      return (
        <>
          <Metrics styles={styles}>
            <Metric styles={styles} title="Total users" metric={k.totalUsers} />
            <Metric styles={styles} title="Active now (≈15 min)" metric={k.activeUsers} />
            <Metric styles={styles} title="AI responses" metric={k.aiResponses} />
            <Metric styles={styles} title="Emergency cases" metric={k.emergencyCases} hint="Triage results rated EMERGENCY" />
            <Metric styles={styles} title="Upvotes" metric={k.upvotes} />
            <Metric styles={styles} title="Downvotes" metric={k.downvotes} />
            <Metric styles={styles} title="API errors (5xx)" metric={k.apiErrors} hint="API Gateway, CloudWatch" />
            <Metric styles={styles} title="Avg AI response time" metric={k.avgResponseMs} format={fmtMs} />
          </Metrics>
          <Card styles={styles} title="User growth" description="New registrations per period.">
            {hasPoints(newUsers) ? <MiniChart styles={styles} colors={colors} labels={labels} series={[{ key: 'new', label: 'New users', color: series[0], values: newUsers }]} />
              : <NoData styles={styles} description={data.users.newInRange.unavailable || 'No registrations recorded in this range.'} />}
          </Card>
          <Card styles={styles} title="Active users" description="Distinct users with an authenticated request (daily).">
            {hasPoints(active) ? <MiniChart styles={styles} colors={colors} labels={labels} series={[{ key: 'active', label: 'Active users', color: series[0], values: active }]} />
              : <NoData styles={styles} description={data.users.dau.unavailable || 'Distinct users are tracked per day; pick a multi-day range.'} />}
          </Card>
          <Card styles={styles} title="AI usage" description="Answered by the model vs. offline fallback.">
            {hasPoints(responses, failed) ? <MiniChart styles={styles} colors={colors} labels={labels} series={[
              { key: 'r', label: 'AI responses', color: series[0], values: responses },
              { key: 'f', label: 'Failed (offline fallback)', color: series[1], values: failed },
            ]} /> : <NoData styles={styles} description={data.ai.responses.unavailable || 'No AI requests in this range.'} />}
          </Card>
          <Card styles={styles} title="Request volume" description="AI requests (messages sent to triage) per period.">
            {hasPoints(requests) ? <MiniChart styles={styles} colors={colors} labels={labels} series={[{ key: 'q', label: 'AI requests', color: series[0], values: requests }]} />
              : <NoData styles={styles} description={data.ai.requests.unavailable || 'No AI requests in this range.'} />}
          </Card>
          <Card styles={styles} title="Feedback" description="Standing votes on AI answers, by the day they were cast.">
            {hasPoints(ups, downs) ? <MiniChart styles={styles} colors={colors} labels={labels} series={[
              { key: 'u', label: 'Upvotes', color: series[0], values: ups },
              { key: 'd', label: 'Downvotes', color: series[1], values: downs },
            ]} /> : <NoData styles={styles} description={data.feedback.up.unavailable || 'No votes in this range.'} />}
          </Card>
          <Card styles={styles} title="Feature usage" description="Totals for the selected range.">
            <BarList styles={styles} color={series[0]} items={[
              item('text', 'AI requests — typed', data.ai.byInputType.text),
              item('voice', 'AI requests — voice', data.ai.byInputType.voice),
              item('image', 'AI requests — image', data.ai.byInputType.image),
              item('chats', 'Conversations started', data.activity.conversationsStarted),
              item('vault', 'Documents uploaded (vault)', data.activity.documentsUploaded),
              item('attach', 'Chat attachments', data.activity.chatAttachments),
            ]} />
          </Card>
        </>
      )
    }}</Gate>
  )
}

function Analytics({ range, refreshKey, styles, colors, sev, series, toast }) {
  const r = useResource(() => getAdminAnalytics(range), [range, refreshKey])
  const [exporting, setExporting] = useState(false)
  const exportCsv = async () => {
    setExporting(true)
    try {
      const csv = await exportAdminAnalyticsCsv(range)
      await Share.share({ title: `sankatai-analytics-${range.from}-${range.to}.csv`, message: csv })
    } catch (e) { toast.error(errText(e, 'Could not export the analytics.')) } finally { setExporting(false) }
  }
  return (
    <Gate r={r} styles={styles} colors={colors}>{(data) => {
      const { labels } = data.range
      const { ai, triage, activity, api } = data
      const bySev = Object.fromEntries(SEVERITIES.map(([s]) => [s, triage.series.map((p) => p[s])]))
      const conv = activity.series.map((p) => p.conversations); const vault = activity.series.map((p) => p.vault); const chat = activity.series.map((p) => p.chat)
      return (
        <>
          <View style={styles.sectionHead}>
            <Text style={styles.h2}>AI requests</Text>
            <TouchableOpacity style={styles.btnSecondary} onPress={exportCsv} disabled={exporting}>
              {exporting ? <ActivityIndicator size="small" color={colors.text} /> : <Download size={14} color={colors.text} />}
              <Text style={styles.btnSecondaryText}>{exporting ? 'Exporting…' : 'Export CSV'}</Text>
            </TouchableOpacity>
          </View>
          <Metrics styles={styles}>
            <Metric styles={styles} title="Requests" metric={ai.requests} />
            <Metric styles={styles} title="Answered by AI" metric={ai.responses} />
            <Metric styles={styles} title="Failed (offline fallback)" metric={ai.failed} />
            <Metric styles={styles} title="Success rate" metric={ai.successRate} format={fmtPct} />
            <Metric styles={styles} title="Avg response time" metric={ai.avgLatencyMs} format={fmtMs} />
            <Metric styles={styles} title="Responses today" metric={ai.responsesToday} />
            <Metric styles={styles} title="All-time AI responses" metric={ai.totalResponses} />
          </Metrics>
          <Card styles={styles} title="Requests over time">
            {hasPoints(ai.series.map((p) => p.requests)) ? <MiniChart styles={styles} colors={colors} labels={labels} series={[
              { key: 'q', label: 'Requests', color: series[0], values: ai.series.map((p) => p.requests) },
              { key: 'r', label: 'Answered', color: series[1], values: ai.series.map((p) => p.responses) },
              { key: 'f', label: 'Failed', color: series[2], values: ai.series.map((p) => p.failed) },
            ]} /> : <NoData styles={styles} description={ai.requests.unavailable || 'No AI requests in this range.'} />}
          </Card>
          <Card styles={styles} title="By input type" description="Requests in the selected range.">
            <BarList styles={styles} color={series[0]} items={[
              { key: 'text', label: 'Text', value: ai.byInputType.text.value, unavailable: ai.byInputType.text.unavailable },
              { key: 'voice', label: 'Voice', value: ai.byInputType.voice.value, unavailable: ai.byInputType.voice.unavailable, color: series[1] },
              { key: 'image', label: 'Image', value: ai.byInputType.image.value, unavailable: ai.byInputType.image.unavailable },
            ]} />
          </Card>

          <Text style={styles.h2}>Triage</Text>
          <Metrics styles={styles}>
            <Metric styles={styles} title="Triage results" metric={triage.total} />
            <Metric styles={styles} title="Emergency cases" metric={triage.emergency} />
          </Metrics>
          <Card styles={styles} title="Risk distribution" description="Severity of every triage result in the range (AI and offline estimates).">
            <BarList styles={styles} items={SEVERITIES.map(([s, label]) => ({ key: s, label, value: triage.bySeverity[s].value, unavailable: triage.bySeverity[s].unavailable, color: sev[s].fill }))} />
          </Card>
          <Card styles={styles} title="Severity over time">
            {hasPoints(...Object.values(bySev)) ? <MiniChart styles={styles} colors={colors} labels={labels}
              series={SEVERITIES.map(([s, label]) => ({ key: s, label, color: sev[s].fill, values: bySev[s] }))} />
              : <NoData styles={styles} description={triage.total.unavailable || 'No triage results in this range.'} />}
          </Card>

          <Text style={styles.h2}>Activity</Text>
          <Metrics styles={styles}>
            <Metric styles={styles} title="Conversations started" metric={activity.conversationsStarted} />
            <Metric styles={styles} title="Active conversations" metric={activity.activeConversations} hint="Distinct conversations with a message" />
            <Metric styles={styles} title="All-time conversations" metric={activity.conversationsTotal} hint="Started (deletions not subtracted)" />
            <Metric styles={styles} title="Documents uploaded" metric={activity.documentsUploaded} hint="Documents vault" />
            <Metric styles={styles} title="Chat attachments" metric={activity.chatAttachments} />
          </Metrics>
          <Card styles={styles} title="Activity over time">
            {hasPoints(conv, vault, chat) ? <MiniChart styles={styles} colors={colors} labels={labels} series={[
              { key: 'c', label: 'Conversations started', color: series[0], values: conv },
              { key: 'v', label: 'Vault uploads', color: series[1], values: vault },
              { key: 'a', label: 'Chat attachments', color: series[2], values: chat },
            ]} /> : <NoData styles={styles} description="No conversations or uploads recorded in this range." />}
          </Card>

          <Text style={styles.h2}>API Gateway</Text>
          <Metrics styles={styles}>
            <Metric styles={styles} title="Requests" metric={api?.requests} hint="CloudWatch AWS/ApiGateway" />
            <Metric styles={styles} title="4xx responses" metric={api?.errors4xx} />
            <Metric styles={styles} title="5xx responses" metric={api?.errors5xx} />
            <Metric styles={styles} title="Avg latency" metric={api?.avgLatencyMs} format={fmtMs} />
          </Metrics>
        </>
      )
    }}</Gate>
  )
}

function UsersPage({ range, refreshKey, styles, colors, series }) {
  const r = useResource(() => getAdminUsers(range), [range, refreshKey])
  return (
    <Gate r={r} styles={styles} colors={colors}>{(data) => {
      const u = data.users; const labels = data.range.labels
      const newUsers = u.series.map((p) => p.new); const active = u.series.map((p) => p.active)
      return (
        <>
          <Text style={styles.muted}>Aggregates only. The console never lists users, emails or profiles; user ids are stored only as salted hashes.</Text>
          <Metrics styles={styles}>
            <Metric styles={styles} title="Total users" metric={u.total} />
            <Metric styles={styles} title="New in range" metric={u.newInRange} />
            <Metric styles={styles} title="Active now (≈15 min)" metric={u.activeNow} hint="Distinct users in the last three 5-minute windows" />
            <Metric styles={styles} title="DAU" metric={u.dau} hint={`On ${data.range.to}`} />
            <Metric styles={styles} title="WAU" metric={u.wau} hint="7 days to the range end" />
            <Metric styles={styles} title="MAU" metric={u.mau} hint="30 days to the range end" />
            <Metric styles={styles} title="Active in range" metric={u.activeInRange} />
          </Metrics>
          <Card styles={styles} title="Growth" description="New registrations (first seen by the platform).">
            {hasPoints(newUsers) ? <MiniChart styles={styles} colors={colors} labels={labels} series={[{ key: 'n', label: 'New users', color: series[0], values: newUsers }]} />
              : <NoData styles={styles} description={u.newInRange.unavailable || 'No registrations in this range.'} />}
          </Card>
          <Card styles={styles} title="Daily active users">
            {hasPoints(active) ? <MiniChart styles={styles} colors={colors} labels={labels} series={[{ key: 'a', label: 'Active users', color: series[0], values: active }]} />
              : <NoData styles={styles} description={u.dau.unavailable || 'Distinct users are tracked per day; pick a multi-day range.'} />}
          </Card>
        </>
      )
    }}</Gate>
  )
}

function FeedbackPage({ range, refreshKey, styles, colors, series }) {
  const r = useResource(() => getAdminFeedback(range), [range, refreshKey])
  return (
    <Gate r={r} styles={styles} colors={colors}>{(data) => {
      const fb = data.feedback
      const ups = fb.series.map((p) => p.up); const downs = fb.series.map((p) => p.down)
      return (
        <>
          <Text style={styles.muted}>Standing votes on AI answers. A changed or cleared vote is removed from the day it was cast.</Text>
          <Metrics styles={styles}>
            <Metric styles={styles} title="Upvotes" metric={fb.up} />
            <Metric styles={styles} title="Downvotes" metric={fb.down} />
            <Metric styles={styles} title="Positive ratio" metric={fb.ratio} format={fmtPct} hint="Upvotes / all votes" />
          </Metrics>
          <Card styles={styles} title="Trend">
            {hasPoints(ups, downs) ? <MiniChart styles={styles} colors={colors} labels={data.range.labels} series={[
              { key: 'u', label: 'Upvotes', color: series[0], values: ups },
              { key: 'd', label: 'Downvotes', color: series[1], values: downs },
            ]} /> : <NoData styles={styles} description={fb.up.unavailable || 'No votes in this range.'} />}
          </Card>
        </>
      )
    }}</Gate>
  )
}

const NAMES = { backend: 'Backend API', dynamodb: 'DynamoDB', s3: 'S3 storage', cognito: 'Cognito', ai_provider: 'AI provider', api_gateway: 'API Gateway' }
// Status is always icon + label, never colour alone.
function StatusBadge({ status, styles, colors }) {
  const map = {
    healthy: ['Healthy', CheckCircle2, colors.success], degraded: ['Degraded', AlertTriangle, colors.warning],
    down: ['Down', XCircle, colors.danger], unavailable: ['Unavailable', CircleSlash, colors.muted],
  }
  const [label, Icon, c] = map[status] || map.unavailable
  return <View style={styles.badge}><Icon size={13} color={c} /><Text style={[styles.badgeText, { color: c }]}>{label}</Text></View>
}
const asMetric = (v) => (v == null ? { value: null, unavailable: 'No API Gateway traffic data for the last hour.' } : { value: v })

function Health({ refreshKey, styles, colors }) {
  const r = useResource(() => getSystemHealth(), [refreshKey])
  return (
    <Gate r={r} styles={styles} colors={colors}>{(data) => {
      const api = data.apiGatewayLastHour
      return (
        <>
          <Text style={styles.muted}>Live probes, cached for {data.cachedForSeconds} s (generated {fmtTime(data.generatedAt)}). Anything that can’t be checked shows as Unavailable, never Healthy.</Text>
          <Card styles={styles} title="Dependencies">
            {data.checks.map((c) => (
              <View key={c.name} style={styles.listRow}>
                <View style={styles.listHead}><Text style={styles.listTitle}>{NAMES[c.name] || c.name}</Text><StatusBadge status={c.status} styles={styles} colors={colors} /></View>
                <Text style={styles.metricNote}>{c.status === 'unavailable' ? '—' : fmtMs(c.latencyMs)} · {fmtTime(c.checkedAt)}{c.detail ? ` · ${c.detail}` : ''}</Text>
              </View>
            ))}
          </Card>
          <Text style={styles.h2}>API Gateway, last hour</Text>
          <Metrics styles={styles}>
            <Metric styles={styles} title="Requests" metric={asMetric(api?.requests)} />
            <Metric styles={styles} title="4xx" metric={asMetric(api?.errors4xx)} />
            <Metric styles={styles} title="5xx" metric={asMetric(api?.errors5xx)} />
            <Metric styles={styles} title="Avg latency" metric={asMetric(api?.avgLatencyMs)} format={fmtMs} />
          </Metrics>
          <Card styles={styles} title="Recent failures" description="Failed probes seen by this backend instance since it started.">
            {data.recentFailures.length === 0 ? <Text style={styles.muted}>No failed probes recorded.</Text> : data.recentFailures.map((f, i) => (
              <View key={`${f.at}-${i}`} style={styles.listRow}>
                <View style={styles.listHead}><Text style={styles.listTitle}>{NAMES[f.name] || f.name}</Text><StatusBadge status={f.status} styles={styles} colors={colors} /></View>
                <Text style={styles.metricNote}>{f.detail || '—'} · {fmtTime(f.at)}</Text>
              </View>
            ))}
          </Card>
        </>
      )
    }}</Gate>
  )
}

function Access({ refreshKey, styles, colors, toast, navigation }) {
  const r = useResource(async () => {
    const [a, i] = await Promise.all([listAdmins(), listInvitations()])
    return { ...a, invitations: i.invitations }
  }, [refreshKey])
  const [email, setEmail] = useState('')
  const [touched, setTouched] = useState(false)
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState('')
  const normalized = email.trim().toLowerCase()
  const emailErr = !GMAIL.test(normalized) ? 'Enter a Gmail address (name@gmail.com).' : ''

  const invite = async () => {
    setTouched(true)
    if (emailErr) return
    setInviting(true); setInviteError('')
    try {
      const inv = await createInvitation(normalized)
      toast.success(`Invitation sent to ${inv.email}. It expires in 48 hours.`)
      setEmail(''); setTouched(false); r.reload()
    } catch (e) { setInviteError(errText(e, 'Could not send the invitation.')) } finally { setInviting(false) }
  }
  const revoke = (inv) => Alert.alert('Revoke this invitation?', `The link sent to ${inv.email} will stop working.`, [
    { text: 'Cancel', style: 'cancel' },
    { text: 'Revoke', style: 'destructive', onPress: async () => {
      try { await revokeInvitation(inv.id); toast.success('Invitation revoked.'); r.reload() } catch (e) { toast.error(errText(e, 'That didn’t work. Try again.')) }
    } },
  ])
  const remove = (a, activeCount) => {
    const self = a.isSelf
    const others = Math.max(0, activeCount - 1)
    Alert.alert(
      self ? 'Remove your own admin access?' : 'Remove this admin?',
      self ? `You will lose access to the admin console immediately and be signed out on other devices. ${others} other active admin${others === 1 ? '' : 's'} will remain.`
        : `${a.email || 'This admin'} loses admin access immediately and is signed out everywhere.`,
      [{ text: 'Cancel', style: 'cancel' }, { text: self ? 'I understand, remove' : 'Remove', style: 'destructive', onPress: async () => {
        try {
          const res = await removeAdmin(a.sub, { confirmSelf: self })
          if (res?.cognitoCleanup !== 'done') toast.error('Access revoked, but Cognito cleanup failed. Remove again to retry.')
          else toast.success(self ? 'You removed your own admin access.' : 'Admin removed.')
          if (self) { try { await refreshSession() } catch { /* revoked by global sign-out */ } navigation.goBack(); return }
          r.reload()
        } catch (e) { toast.error(errText(e, 'That didn’t work. Try again.')) }
      } }],
    )
  }

  return (
    <Gate r={r} styles={styles} colors={colors}>{(data) => {
      const lastAdmin = data.activeCount <= 1
      return (
        <>
          <Card styles={styles} title="Invite an admin" description="The invitee gets a one-time link (valid 48 hours) and must sign in with the same, verified Gmail address.">
            {!!inviteError && <Text style={styles.err}>{inviteError}</Text>}
            <TextInput style={styles.input} value={email} onChangeText={(v) => { setEmail(v); setInviteError('') }} onBlur={() => setTouched(true)}
              placeholder="name@gmail.com" placeholderTextColor={colors.muted} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} accessibilityLabel="Gmail address" />
            {touched && !!emailErr && <Text style={styles.err}>{emailErr}</Text>}
            <TouchableOpacity style={styles.btnPrimary} onPress={invite} disabled={inviting}>
              {inviting ? <ActivityIndicator color={colors.onPrimary} /> : <><MailPlus size={15} color={colors.onPrimary} /><Text style={styles.btnPrimaryText}>Send invitation</Text></>}
            </TouchableOpacity>
          </Card>

          <Card styles={styles} title={`Admins (${data.activeCount} active)`}>
            {data.admins.map((a) => {
              const canAct = !a.isRoot && (a.isSelf || data.canRemoveOthers) && (a.status === 'active' || a.cognitoCleanup === 'failed')
              const blocked = a.status === 'active' && lastAdmin
              return (
                <View key={a.sub} style={styles.listRow}>
                  <View style={styles.listHead}>
                    <Text style={[styles.listTitle, { flex: 1 }]} numberOfLines={1}>{a.email || '—'}</Text>
                    {a.isRoot && <Text style={styles.tag}>Root</Text>}
                    {a.isSelf && <Text style={styles.tag}>You</Text>}
                  </View>
                  <Text style={styles.metricNote}>{a.status}{a.cognitoCleanup === 'failed' ? ' · Cognito cleanup failed' : ''} · {fmtTime(a.grantedAt)} · {a.grantedVia === 'bootstrap' ? 'Bootstrap' : 'Invitation'}</Text>
                  {canAct && (
                    <TouchableOpacity style={[styles.btnGhost, blocked && { opacity: 0.45 }]} disabled={blocked} onPress={() => remove(a, data.activeCount)}>
                      <UserMinus size={14} color={colors.text} /><Text style={styles.btnSecondaryText}>{a.status === 'active' ? (a.isSelf ? 'Leave' : 'Remove') : 'Retry cleanup'}</Text>
                    </TouchableOpacity>
                  )}
                  {canAct && blocked && <Text style={styles.metricNote}>The last active admin can’t be removed. Invite another admin first.</Text>}
                </View>
              )
            })}
          </Card>

          <Card styles={styles} title="Invitations">
            {data.invitations.length === 0 ? <Text style={styles.muted}>No invitations yet.</Text> : data.invitations.map((i) => (
              <View key={i.id} style={styles.listRow}>
                <Text style={styles.listTitle} numberOfLines={1}>{i.email}</Text>
                <Text style={styles.metricNote}>{i.status}{i.emailStatus === 'failed' ? ' · email failed' : ''} · sent {fmtTime(i.createdAt)} · expires {fmtTime(i.expiresAt)}</Text>
                {i.status === 'pending' && (
                  <TouchableOpacity style={styles.btnGhost} onPress={() => revoke(i)}><XCircle size={14} color={colors.text} /><Text style={styles.btnSecondaryText}>Revoke</Text></TouchableOpacity>
                )}
              </View>
            ))}
          </Card>
        </>
      )
    }}</Gate>
  )
}

const short = (sub) => (sub && sub.length > 14 ? `${sub.slice(0, 8)}…${sub.slice(-4)}` : sub || '—')
function Audit({ refreshKey, styles, colors }) {
  const r = useResource(() => getAuditLogs(), [refreshKey])
  const [more, setMore] = useState({ key: null, items: [], cursor: undefined })
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState('')
  return (
    <Gate r={r} styles={styles} colors={colors}>{(data) => {
      const extra = more.key === data ? more : { items: [], cursor: undefined }
      const items = [...data.items, ...extra.items]
      const cursor = extra.cursor === undefined ? data.nextCursor : extra.cursor
      const loadMore = async () => {
        setLoadingMore(true); setMoreError('')
        try { const page = await getAuditLogs(cursor); setMore({ key: data, items: [...extra.items, ...page.items], cursor: page.nextCursor }) }
        catch (e) { setMoreError(errText(e, 'Could not load more entries.')) } finally { setLoadingMore(false) }
      }
      return (
        <>
          <Text style={styles.muted}>Append-only record of admin actions and denied admin requests. Newest first. Read-only.</Text>
          <Card styles={styles} title="Audit log">
            {items.length === 0 ? <NoData styles={styles} title="No audit entries yet" /> : items.map((i) => (
              <View key={`${i.ts}-${i.requestId || ''}-${i.action}`} style={styles.listRow}>
                <View style={styles.listHead}>
                  <Text style={[styles.listTitle, { flex: 1, textTransform: 'capitalize' }]}>{i.action.replace(/_/g, ' ')}</Text>
                  <Text style={[styles.tag, (i.result === 'denied' || i.result === 'error') && { color: colors.danger, borderColor: colors.dangerBorder }]}>{i.result}</Text>
                </View>
                <Text style={styles.metricNote}>{fmtTime(i.ts)} · {short(i.adminSub)}{i.reason ? ` · ${i.reason.replace(/_/g, ' ')}` : ''}</Text>
                {!!i.resource && <Text style={styles.metricNote}>{i.resource}</Text>}
                <Text style={styles.metricNote}>IP {i.ip || '—'} · req {i.requestId ? i.requestId.slice(0, 10) : '—'}</Text>
              </View>
            ))}
          </Card>
          {!!moreError && <Text style={styles.err}>{moreError}</Text>}
          {!!cursor && (
            <TouchableOpacity style={styles.btnSecondary} onPress={loadMore} disabled={loadingMore}>
              {loadingMore ? <ActivityIndicator size="small" color={colors.text} /> : <Text style={styles.btnSecondaryText}>Load more</Text>}
            </TouchableOpacity>
          )}
        </>
      )
    }}</Gate>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 },
  titleIc: { width: 30, height: 30, borderRadius: 9, backgroundColor: colors.primarySoft, alignItems: 'center', justifyContent: 'center' },
  title: { fontSize: 16, fontWeight: '800', color: colors.text },
  sub: { fontSize: 11.5, color: colors.muted },
  iconBtn: { width: 36, height: 36, borderRadius: 10, borderWidth: 1, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  navScroll: { flexGrow: 0, backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 },
  nav: { paddingHorizontal: 10, paddingVertical: 8, gap: 6 },
  navItem: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999 },
  navItemOn: { backgroundColor: colors.primarySoft },
  navText: { fontSize: 13, fontWeight: '600', color: colors.muted },
  main: { padding: 16, gap: 14, paddingBottom: 40 },
  scope: { fontSize: 12, color: colors.muted, lineHeight: 17 },
  filters: { gap: 8 },
  seg: { flexDirection: 'row', backgroundColor: colors.surface2, borderRadius: radius.md, padding: 3 },
  segItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: radius.sm },
  segOn: { backgroundColor: colors.surface },
  segText: { fontSize: 12.5, fontWeight: '600', color: colors.muted },
  customRow: { flexDirection: 'row', gap: 8, alignItems: 'center' },
  dateInput: { flex: 1, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: 10, paddingVertical: 8, fontSize: 13, color: colors.text, backgroundColor: colors.surface },
  rangeNote: { fontSize: 12, color: colors.muted },
  warn: { fontSize: 12.5, color: colors.warning },
  state: { alignItems: 'center', gap: 8, paddingVertical: 40 },
  stateTitle: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'center' },
  stateText: { fontSize: 13, color: colors.muted, textAlign: 'center', lineHeight: 19 },
  metrics: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  metric: { flexGrow: 1, flexBasis: '46%', backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.md, padding: 12, gap: 4 },
  metricLabel: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  metricValue: { fontSize: 22, fontWeight: '800', color: colors.text },
  metricNote: { fontSize: 11.5, color: colors.muted, lineHeight: 16 },
  unavailable: { color: colors.muted, fontSize: 15, fontWeight: '700' },
  card: { backgroundColor: colors.surface, borderColor: colors.border, borderWidth: 1, borderRadius: radius.lg, padding: 14, gap: 10 },
  cardTitle: { fontSize: 15, fontWeight: '700', color: colors.text },
  cardDesc: { fontSize: 12.5, color: colors.muted, marginTop: -6 },
  noData: { alignItems: 'center', gap: 4, paddingVertical: 16 },
  noDataTitle: { fontSize: 14, fontWeight: '700', color: colors.text },
  barHead: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 },
  barLabel: { fontSize: 13, color: colors.textSecondary, flexShrink: 1 },
  barValue: { fontSize: 13, fontWeight: '700', color: colors.text },
  track: { height: 8, borderRadius: 99, backgroundColor: colors.surface2, overflow: 'hidden' },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 12, marginBottom: 8 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  legendDot: { width: 10, height: 10, borderRadius: 3 },
  legendText: { fontSize: 12, color: colors.textSecondary },
  chart: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, borderBottomWidth: 1, borderBottomColor: colors.border },
  group: { width: GROUP_W, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'center', gap: 1 },
  col: { flex: 1, borderTopLeftRadius: 2, borderTopRightRadius: 2 },
  axis: { flexDirection: 'row', height: 18, paddingRight: 40 },
  axisCell: { width: GROUP_W + 4, overflow: 'visible' },
  axisText: { position: 'absolute', left: 0, top: 4, width: 56, fontSize: 9.5, color: colors.muted },
  sectionHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  h2: { fontSize: 16, fontWeight: '800', color: colors.text, marginTop: 4 },
  muted: { fontSize: 12.5, color: colors.muted, lineHeight: 18 },
  listRow: { gap: 4, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.border },
  listHead: { flexDirection: 'row', alignItems: 'center', gap: 8, justifyContent: 'space-between' },
  listTitle: { fontSize: 14, fontWeight: '600', color: colors.text },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  badgeText: { fontSize: 12, fontWeight: '700' },
  tag: { fontSize: 11, fontWeight: '700', color: colors.textSecondary, borderWidth: 1, borderColor: colors.border, borderRadius: 999, paddingVertical: 2, paddingHorizontal: 8, overflow: 'hidden' },
  input: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 12, paddingVertical: 10, fontSize: 14, color: colors.text, backgroundColor: colors.bg },
  err: { fontSize: 12.5, color: colors.danger },
  btnPrimary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, backgroundColor: colors.primary, borderRadius: radius.md, paddingVertical: 11 },
  btnPrimaryText: { color: colors.onPrimary, fontWeight: '700' },
  btnSecondary: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface, borderRadius: radius.md, paddingVertical: 9, paddingHorizontal: 14 },
  btnSecondaryText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  btnGhost: { alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 6, paddingHorizontal: 10, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border },
})
