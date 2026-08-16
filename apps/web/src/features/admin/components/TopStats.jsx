// Compact business/engagement statistics.
import { fmt } from '../format'

export default function TopStats({ data }) {
  if (!data) return null
  const items = [
    { label: 'Daily Active Users', value: fmt(data.dau) },
    { label: 'Weekly Active Users', value: fmt(data.wau) },
    { label: 'Monthly Active Users', value: fmt(data.mau) },
    { label: 'User retention', value: `${data.retention}%` },
    { label: 'Avg chats / user', value: data.avgChatsPerUser },
    { label: 'Avg sessions / user', value: data.avgSessionsPerUser },
    { label: 'New users this month', value: fmt(data.newThisMonth) },
    { label: 'User growth rate', value: `+${data.growthRate}%` },
  ]
  return (
    <section className="ac-card ac-panel">
      <div className="ac-panel-head"><h3>Top Statistics</h3></div>
      <div className="ac-topstats">
        {items.map((it) => (
          <div key={it.label} className="ac-topstat">
            <span className="ac-topstat-value">{it.value}</span>
            <span className="ac-topstat-label">{it.label}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
