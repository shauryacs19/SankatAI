// User growth over time + new/active/returning breakdown.
import { fmt, CHART } from '../format'
import LineChart from './charts/LineChart.jsx'

const LINES = [
  { key: 'users', color: CHART.users, label: 'Total users', fill: true },
  { key: 'activeUsers', color: CHART.active, label: 'Active' },
  { key: 'returningUsers', color: CHART.returning, label: 'Returning' },
]

export default function UserAnalytics({ data }) {
  if (!data) return null
  const series = data.series || []
  const latest = series[series.length - 1] || {}

  return (
    <section className="ac-card ac-panel">
      <div className="ac-panel-head">
        <h3>User Growth</h3>
        <div className="ac-legend">
          {LINES.map((l) => (
            <span key={l.key} className="ac-legend-item"><i style={{ background: l.color }} />{l.label}</span>
          ))}
        </div>
      </div>
      <LineChart data={series} lines={LINES} height={150} />
      <div className="ac-substats">
        <div className="ac-substat"><span>New users</span><b>{fmt(latest.newUsers)}</b></div>
        <div className="ac-substat"><span>Active users</span><b>{fmt(latest.activeUsers)}</b></div>
        <div className="ac-substat"><span>Returning users</span><b>{fmt(latest.returningUsers)}</b></div>
      </div>
    </section>
  )
}
