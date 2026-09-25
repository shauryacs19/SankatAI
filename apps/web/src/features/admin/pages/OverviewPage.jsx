import { useOutletContext } from 'react-router-dom'
import { AlertTriangle, Clock, Siren, Sparkles, ThumbsDown, ThumbsUp, UserCheck, Users } from 'lucide-react'
import { Card } from '../../../components/ui'
import { getAnalytics } from '../services/adminApi'
import { useAdminResource } from '../useAdminResource'
import MetricCard from '../components/MetricCard.jsx'
import TimeSeriesChart from '../components/TimeSeriesChart.jsx'
import BarList from '../components/BarList.jsx'
import { LoadError, NoData, PageSkeleton } from '../components/States.jsx'
import { fmtMs, hasPoints, SERIES } from '../format'

export function KpiGrid({ kpis }) {
  const cards = [
    { title: 'Total users', metric: kpis.totalUsers, Icon: Users },
    { title: 'Active now (≈15 min)', metric: kpis.activeUsers, Icon: UserCheck },
    { title: 'AI responses', metric: kpis.aiResponses, Icon: Sparkles },
    { title: 'Emergency cases', metric: kpis.emergencyCases, Icon: Siren, hint: 'Triage results rated EMERGENCY' },
    { title: 'Upvotes', metric: kpis.upvotes, Icon: ThumbsUp },
    { title: 'Downvotes', metric: kpis.downvotes, Icon: ThumbsDown },
    { title: 'API errors (5xx)', metric: kpis.apiErrors, Icon: AlertTriangle, hint: 'API Gateway, CloudWatch' },
    { title: 'Avg AI response time', metric: kpis.avgResponseMs, Icon: Clock, format: fmtMs },
  ]
  return <div className="ac-metrics">{cards.map((c) => <MetricCard key={c.title} {...c} />)}</div>
}

export default function OverviewPage() {
  const { range, refreshKey } = useOutletContext()
  const { data, refreshing, error, reload } = useAdminResource(() => getAnalytics(range), [range, refreshKey])

  if (!data) return error ? <LoadError error={error} onRetry={reload} retrying={refreshing} /> : <PageSkeleton />

  const { labels } = data.range
  const u = data.users.series
  const ai = data.ai.series
  const fb = data.feedback.series
  const newUsers = u.map((p) => p.new)
  const active = u.map((p) => p.active)
  const requests = ai.map((p) => p.requests)
  const responses = ai.map((p) => p.responses)
  const failed = ai.map((p) => p.failed)
  const ups = fb.map((p) => p.up)
  const downs = fb.map((p) => p.down)
  const toItem = (key, label, m) => ({ key, label, value: m?.value ?? null, unavailable: m?.unavailable })

  return (
    <div className={`ac-stack ${refreshing ? 'ac-dim' : ''}`} aria-busy={refreshing || undefined}>
      <KpiGrid kpis={data.kpis} />

      <div className="ac-grid-2">
        <Card title="User growth" headingLevel={2} description="New registrations per period.">
          {hasPoints(newUsers) ? <TimeSeriesChart title="New users" labels={labels} series={[{ key: 'new', label: 'New users', color: SERIES[0], values: newUsers }]} />
            : <NoData description={data.users.newInRange.unavailable || 'No registrations recorded in this range.'} />}
        </Card>
        <Card title="Active users" headingLevel={2} description="Distinct users with an authenticated request (daily).">
          {hasPoints(active) ? <TimeSeriesChart title="Daily active users" labels={labels} series={[{ key: 'active', label: 'Active users', color: SERIES[0], values: active }]} />
            : <NoData description={data.users.dau.unavailable || 'Distinct users are tracked per day; pick a multi-day range.'} />}
        </Card>
        <Card title="AI usage" headingLevel={2} description="Answered by the model vs. offline fallback.">
          {hasPoints(responses, failed) ? (
            <TimeSeriesChart title="AI responses and failures" type="bar" labels={labels} series={[
              { key: 'responses', label: 'AI responses', color: SERIES[0], values: responses },
              { key: 'failed', label: 'Failed (offline fallback)', color: SERIES[1], values: failed },
            ]} />
          ) : <NoData description={data.ai.responses.unavailable || 'No AI requests in this range.'} />}
        </Card>
        <Card title="Request volume" headingLevel={2} description="AI requests (messages sent to triage) per period.">
          {hasPoints(requests) ? <TimeSeriesChart title="AI requests" labels={labels} series={[{ key: 'requests', label: 'AI requests', color: SERIES[0], values: requests }]} />
            : <NoData description={data.ai.requests.unavailable || 'No AI requests in this range.'} />}
        </Card>
        <Card title="Feedback" headingLevel={2} description="Standing votes on AI answers, by the day they were cast.">
          {hasPoints(ups, downs) ? (
            <TimeSeriesChart title="Upvotes and downvotes" type="bar" labels={labels} series={[
              { key: 'up', label: 'Upvotes', color: SERIES[0], values: ups },
              { key: 'down', label: 'Downvotes', color: SERIES[1], values: downs },
            ]} />
          ) : <NoData description={data.feedback.up.unavailable || 'No votes in this range.'} />}
        </Card>
        <Card title="Feature usage" headingLevel={2} description="Totals for the selected range.">
          <BarList label="Feature usage" items={[
            toItem('text', 'AI requests — typed', data.ai.byInputType.text),
            toItem('voice', 'AI requests — voice', data.ai.byInputType.voice),
            toItem('image', 'AI requests — image', data.ai.byInputType.image),
            toItem('chats', 'Conversations started', data.activity.conversationsStarted),
            toItem('vault', 'Documents uploaded (vault)', data.activity.documentsUploaded),
            toItem('attach', 'Chat attachments', data.activity.chatAttachments),
          ]} />
        </Card>
      </div>
    </div>
  )
}
