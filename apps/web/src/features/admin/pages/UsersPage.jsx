import { useOutletContext } from 'react-router-dom'
import { CalendarDays, CalendarRange, UserCheck, UserPlus, Users } from 'lucide-react'
import { Card } from '../../../components/ui'
import { getUserAggregates } from '../services/adminApi'
import { useAdminResource } from '../useAdminResource'
import MetricCard from '../components/MetricCard.jsx'
import TimeSeriesChart from '../components/TimeSeriesChart.jsx'
import { LoadError, NoData, PageSkeleton } from '../components/States.jsx'
import { hasPoints, SERIES } from '../format'

export default function UsersPage() {
  const { range, refreshKey } = useOutletContext()
  const { data, refreshing, error, reload } = useAdminResource(() => getUserAggregates(range), [range, refreshKey])

  if (!data) return error ? <LoadError error={error} onRetry={reload} retrying={refreshing} /> : <PageSkeleton cards={7} />

  const u = data.users
  const labels = data.range.labels
  const newUsers = u.series.map((p) => p.new)
  const active = u.series.map((p) => p.active)

  return (
    <div className={`ac-stack ${refreshing ? 'ac-dim' : ''}`} aria-busy={refreshing || undefined}>
      <p className="ac-muted">Aggregates only. The console never lists users, emails or profiles; user ids are stored only as salted hashes.</p>
      <div className="ac-metrics">
        <MetricCard title="Total users" metric={u.total} Icon={Users} />
        <MetricCard title="New in range" metric={u.newInRange} Icon={UserPlus} />
        <MetricCard title="Active now (≈15 min)" metric={u.activeNow} Icon={UserCheck} hint="Distinct users in the last three 5-minute windows" />
        <MetricCard title="DAU" metric={u.dau} Icon={CalendarDays} hint={`On ${data.range.to}`} />
        <MetricCard title="WAU" metric={u.wau} Icon={CalendarRange} hint="7 days to the range end" />
        <MetricCard title="MAU" metric={u.mau} Icon={CalendarRange} hint="30 days to the range end" />
        <MetricCard title="Active in range" metric={u.activeInRange} Icon={UserCheck} />
      </div>
      <div className="ac-grid-2">
        <Card title="Growth" headingLevel={2} description="New registrations (first seen by the platform).">
          {hasPoints(newUsers) ? <TimeSeriesChart title="New users" labels={labels} series={[{ key: 'new', label: 'New users', color: SERIES[0], values: newUsers }]} />
            : <NoData description={u.newInRange.unavailable || 'No registrations in this range.'} />}
        </Card>
        <Card title="Daily active users" headingLevel={2}>
          {hasPoints(active) ? <TimeSeriesChart title="Daily active users" labels={labels} series={[{ key: 'active', label: 'Active users', color: SERIES[0], values: active }]} />
            : <NoData description={u.dau.unavailable || 'Distinct users are tracked per day; pick a multi-day range.'} />}
        </Card>
      </div>
    </div>
  )
}
