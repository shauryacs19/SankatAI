import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Activity, CheckCircle2, Clock, Download, MessagesSquare, Server, Siren, Sparkles, XCircle } from 'lucide-react'
import { Button, Card, useToast } from '../../../components/ui'
import { errText } from '../../../utils/errText'
import { exportAnalyticsCsv, getAnalytics } from '../services/adminApi'
import { useAdminResource } from '../useAdminResource'
import MetricCard from '../components/MetricCard.jsx'
import TimeSeriesChart from '../components/TimeSeriesChart.jsx'
import BarList from '../components/BarList.jsx'
import { LoadError, NoData, PageSkeleton } from '../components/States.jsx'
import { fmtMs, fmtPct, hasPoints, SERIES, SEVERITY_COLORS } from '../format'

const SEVERITIES = [['EMERGENCY', 'Emergency'], ['HIGH', 'High'], ['MODERATE', 'Moderate'], ['LOW', 'Low']]

export default function AnalyticsPage() {
  const { range, refreshKey } = useOutletContext()
  const toast = useToast()
  const [exporting, setExporting] = useState(false)
  const { data, refreshing, error, reload } = useAdminResource(() => getAnalytics(range), [range, refreshKey])

  const exportCsv = async () => {
    setExporting(true)
    try {
      const csv = await exportAnalyticsCsv(range)
      const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
      const a = document.createElement('a')
      a.href = url
      a.download = `sankatai-analytics-${range.from}-${range.to}.csv`
      a.click()
      URL.revokeObjectURL(url)
    } catch (err) {
      toast.error(errText(err, 'Could not export the analytics.'))
    } finally {
      setExporting(false)
    }
  }

  if (!data) return error ? <LoadError error={error} onRetry={reload} retrying={refreshing} /> : <PageSkeleton />

  const { labels } = data.range
  const { ai, triage, activity, api } = data
  const bySeverity = Object.fromEntries(SEVERITIES.map(([s]) => [s, triage.series.map((p) => p[s])]))
  const conversations = activity.series.map((p) => p.conversations)
  const vault = activity.series.map((p) => p.vault)
  const chat = activity.series.map((p) => p.chat)

  return (
    <div className={`ac-stack ${refreshing ? 'ac-dim' : ''}`} aria-busy={refreshing || undefined}>
      <div className="ac-section-head">
        <h2>AI requests</h2>
        <Button variant="secondary" size="sm" icon={Download} onClick={exportCsv} loading={exporting} loadingText="Exporting…">Export CSV</Button>
      </div>
      <div className="ac-metrics">
        <MetricCard title="Requests" metric={ai.requests} Icon={Activity} />
        <MetricCard title="Answered by AI" metric={ai.responses} Icon={CheckCircle2} />
        <MetricCard title="Failed (offline fallback)" metric={ai.failed} Icon={XCircle} />
        <MetricCard title="Success rate" metric={ai.successRate} format={fmtPct} Icon={Sparkles} />
        <MetricCard title="Avg response time" metric={ai.avgLatencyMs} format={fmtMs} Icon={Clock} />
        <MetricCard title="Responses today" metric={ai.responsesToday} Icon={Sparkles} />
        <MetricCard title="All-time AI responses" metric={ai.totalResponses} Icon={Sparkles} />
      </div>
      <div className="ac-grid-2">
        <Card title="Requests over time" headingLevel={3}>
          {hasPoints(ai.series.map((p) => p.requests)) ? (
            <TimeSeriesChart title="AI requests, answers and failures" labels={labels} series={[
              { key: 'requests', label: 'Requests', color: SERIES[0], values: ai.series.map((p) => p.requests) },
              { key: 'responses', label: 'Answered', color: SERIES[1], values: ai.series.map((p) => p.responses) },
              { key: 'failed', label: 'Failed', color: SERIES[2], values: ai.series.map((p) => p.failed) },
            ]} />
          ) : <NoData description={ai.requests.unavailable || 'No AI requests in this range.'} />}
        </Card>
        <Card title="By input type" headingLevel={3} description="Requests in the selected range.">
          <BarList label="AI requests by input type" items={[
            { key: 'text', label: 'Text', value: ai.byInputType.text.value, unavailable: ai.byInputType.text.unavailable },
            { key: 'voice', label: 'Voice', value: ai.byInputType.voice.value, unavailable: ai.byInputType.voice.unavailable, color: 'var(--viz-2)' },
            { key: 'image', label: 'Image', value: ai.byInputType.image.value, unavailable: ai.byInputType.image.unavailable },
          ]} />
        </Card>
      </div>

      <h2 className="ac-h2">Triage</h2>
      <div className="ac-metrics">
        <MetricCard title="Triage results" metric={triage.total} Icon={Activity} />
        <MetricCard title="Emergency cases" metric={triage.emergency} Icon={Siren} />
      </div>
      <div className="ac-grid-2">
        <Card title="Risk distribution" headingLevel={3} description="Severity of every triage result in the range (AI and offline estimates).">
          <BarList label="Triage results by severity" items={SEVERITIES.map(([s, label]) => ({
            key: s, label, value: triage.bySeverity[s].value, unavailable: triage.bySeverity[s].unavailable, color: SEVERITY_COLORS[s],
          }))} />
        </Card>
        <Card title="Severity over time" headingLevel={3}>
          {hasPoints(...Object.values(bySeverity)) ? (
            <TimeSeriesChart title="Triage results by severity" type="bar" labels={labels}
              series={SEVERITIES.map(([s, label]) => ({ key: s, label, color: SEVERITY_COLORS[s], values: bySeverity[s] }))} />
          ) : <NoData description={triage.total.unavailable || 'No triage results in this range.'} />}
        </Card>
      </div>

      <h2 className="ac-h2">Activity</h2>
      <div className="ac-metrics">
        <MetricCard title="Conversations started" metric={activity.conversationsStarted} Icon={MessagesSquare} />
        <MetricCard title="Active conversations" metric={activity.activeConversations} Icon={MessagesSquare} hint="Distinct conversations with a message" />
        <MetricCard title="All-time conversations" metric={activity.conversationsTotal} Icon={MessagesSquare} hint="Started (deletions not subtracted)" />
        <MetricCard title="Documents uploaded" metric={activity.documentsUploaded} Icon={Activity} hint="Documents vault" />
        <MetricCard title="Chat attachments" metric={activity.chatAttachments} Icon={Activity} />
      </div>
      <Card title="Activity over time" headingLevel={3}>
        {hasPoints(conversations, vault, chat) ? (
          <TimeSeriesChart title="Conversations and uploads" labels={labels} series={[
            { key: 'conversations', label: 'Conversations started', color: SERIES[0], values: conversations },
            { key: 'vault', label: 'Vault uploads', color: SERIES[1], values: vault },
            { key: 'chat', label: 'Chat attachments', color: SERIES[2], values: chat },
          ]} />
        ) : <NoData description="No conversations or uploads recorded in this range." />}
      </Card>

      <h2 className="ac-h2">API Gateway</h2>
      <div className="ac-metrics">
        <MetricCard title="Requests" metric={api?.requests} Icon={Server} hint="CloudWatch AWS/ApiGateway" />
        <MetricCard title="4xx responses" metric={api?.errors4xx} Icon={Server} />
        <MetricCard title="5xx responses" metric={api?.errors5xx} Icon={Server} />
        <MetricCard title="Avg latency" metric={api?.avgLatencyMs} format={fmtMs} Icon={Clock} />
      </div>
    </div>
  )
}
