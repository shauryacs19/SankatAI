// A single metric card: label, big value, and a period-over-period change.
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react'

export default function MetricCard({ title, value, change, changeLabel, Icon, lowerIsBetter = false }) {
  const neutral = change == null || change === 0
  const positive = lowerIsBetter ? change < 0 : change > 0
  const cls = neutral ? 'flat' : positive ? 'up' : 'down'

  return (
    <div className="ac-card ac-metric">
      <div className="ac-metric-top">
        <span className="ac-metric-label">{title}</span>
        {Icon && <span className="ac-metric-icon" aria-hidden="true"><Icon size={16} /></span>}
      </div>
      <div className="ac-metric-value">{value}</div>
      {change != null && (
        <div className={`ac-metric-change ${cls}`}>
          {neutral ? <Minus size={13} /> : positive ? <ArrowUpRight size={13} /> : <ArrowDownRight size={13} />}
          <span>{change > 0 ? '+' : ''}{change}%{changeLabel ? ` ${changeLabel}` : ''}</span>
        </div>
      )}
    </div>
  )
}
