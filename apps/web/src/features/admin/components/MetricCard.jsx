// KPI tile: label, one number, and where it comes from. A metric the platform
// does not record renders "Unavailable" with the reason in plain view — never
// a made-up 0.
import { Skeleton } from '../../../components/ui'
import { fmt } from '../format'

export default function MetricCard({ title, metric, format = fmt, Icon, hint, loading = false }) {
  const unavailable = !loading && (metric == null || metric.value == null)
  const note = unavailable
    ? metric?.unavailable || 'Not recorded.'
    : metric?.note || (metric?.partialSince ? `Since ${metric.partialSince} (tracking start)` : hint)

  return (
    <div className="ac-card ac-metric">
      <div className="ac-metric-top">
        <span className="ac-metric-label">{title}</span>
        {Icon && <span className="ac-metric-icon" aria-hidden="true"><Icon size={16} /></span>}
      </div>
      {loading ? (
        <Skeleton height="1.75rem" width="60%" />
      ) : (
        <div className={`ac-metric-value ${unavailable ? 'ac-unavailable' : ''}`}>{unavailable ? 'Unavailable' : format(metric.value)}</div>
      )}
      {!loading && note && <p className="ac-metric-note">{note}</p>}
    </div>
  )
}
