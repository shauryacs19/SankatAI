import { useOutletContext } from 'react-router-dom'
import { Percent, ThumbsDown, ThumbsUp } from 'lucide-react'
import { Card } from '../../../components/ui'
import { getFeedback } from '../services/adminApi'
import { useAdminResource } from '../useAdminResource'
import MetricCard from '../components/MetricCard.jsx'
import TimeSeriesChart from '../components/TimeSeriesChart.jsx'
import { LoadError, NoData, PageSkeleton } from '../components/States.jsx'
import { fmtPct, hasPoints, SERIES } from '../format'

export default function FeedbackPage() {
  const { range, refreshKey } = useOutletContext()
  const { data, refreshing, error, reload } = useAdminResource(() => getFeedback(range), [range, refreshKey])

  if (!data) return error ? <LoadError error={error} onRetry={reload} retrying={refreshing} /> : <PageSkeleton cards={3} />

  const fb = data.feedback
  const ups = fb.series.map((p) => p.up)
  const downs = fb.series.map((p) => p.down)

  return (
    <div className={`ac-stack ${refreshing ? 'ac-dim' : ''}`} aria-busy={refreshing || undefined}>
      <p className="ac-muted">Standing votes on AI answers. A changed or cleared vote is removed from the day it was cast.</p>
      <div className="ac-metrics">
        <MetricCard title="Upvotes" metric={fb.up} Icon={ThumbsUp} />
        <MetricCard title="Downvotes" metric={fb.down} Icon={ThumbsDown} />
        <MetricCard title="Positive ratio" metric={fb.ratio} format={fmtPct} Icon={Percent} hint="Upvotes / all votes" />
      </div>
      <Card title="Trend" headingLevel={2}>
        {hasPoints(ups, downs) ? (
          <TimeSeriesChart title="Upvotes and downvotes" type="bar" labels={data.range.labels} series={[
            { key: 'up', label: 'Upvotes', color: SERIES[0], values: ups },
            { key: 'down', label: 'Downvotes', color: SERIES[1], values: downs },
          ]} />
        ) : <NoData description={fb.up.unavailable || 'No votes in this range.'} />}
      </Card>
    </div>
  )
}
