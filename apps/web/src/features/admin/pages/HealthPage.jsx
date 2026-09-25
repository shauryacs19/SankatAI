import { useOutletContext } from 'react-router-dom'
import { AlertTriangle, CheckCircle2, CircleSlash, XCircle } from 'lucide-react'
import { Card } from '../../../components/ui'
import { getSystemHealth } from '../services/adminApi'
import { useAdminResource } from '../useAdminResource'
import MetricCard from '../components/MetricCard.jsx'
import { LoadError, PageSkeleton } from '../components/States.jsx'
import { fmtMs, fmtTime } from '../format'

const NAMES = {
  backend: 'Backend API', dynamodb: 'DynamoDB', s3: 'S3 storage', cognito: 'Cognito',
  ai_provider: 'AI provider', api_gateway: 'API Gateway',
}
// Status is always icon + label, never colour alone.
const STATUS = {
  healthy: { label: 'Healthy', icon: CheckCircle2 },
  degraded: { label: 'Degraded', icon: AlertTriangle },
  down: { label: 'Down', icon: XCircle },
  unavailable: { label: 'Unavailable', icon: CircleSlash },
}

export function StatusBadge({ status }) {
  const s = STATUS[status] || STATUS.unavailable
  const Icon = s.icon
  return <span className={`ac-status ac-status--${STATUS[status] ? status : 'unavailable'}`}><Icon size={14} aria-hidden="true" />{s.label}</span>
}

const asMetric = (v) => (v == null ? { value: null, unavailable: 'No API Gateway traffic data for the last hour.' } : { value: v })

export default function HealthPage() {
  const { refreshKey } = useOutletContext()
  const { data, refreshing, error, reload } = useAdminResource(() => getSystemHealth(), [refreshKey])

  if (!data) return error ? <LoadError error={error} onRetry={reload} retrying={refreshing} /> : <PageSkeleton cards={4} />

  const api = data.apiGatewayLastHour
  return (
    <div className={`ac-stack ${refreshing ? 'ac-dim' : ''}`} aria-busy={refreshing || undefined}>
      <p className="ac-muted">Live probes, cached for {data.cachedForSeconds} s (generated {fmtTime(data.generatedAt)}). Anything that can’t be checked shows as Unavailable, never Healthy.</p>
      <Card title="Dependencies" headingLevel={2} flush>
        <div className="ac-table-wrap">
          <table className="ac-table">
            <thead><tr><th scope="col">Service</th><th scope="col">Status</th><th scope="col">Latency</th><th scope="col">Last checked</th><th scope="col">Detail</th></tr></thead>
            <tbody>
              {data.checks.map((c) => (
                <tr key={c.name}>
                  <th scope="row">{NAMES[c.name] || c.name}</th>
                  <td><StatusBadge status={c.status} /></td>
                  <td>{c.status === 'unavailable' ? '—' : fmtMs(c.latencyMs)}</td>
                  <td>{fmtTime(c.checkedAt)}</td>
                  <td className="ac-wrap">{c.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <h2 className="ac-h2">API Gateway, last hour</h2>
      <div className="ac-metrics">
        <MetricCard title="Requests" metric={asMetric(api?.requests)} />
        <MetricCard title="4xx" metric={asMetric(api?.errors4xx)} />
        <MetricCard title="5xx" metric={asMetric(api?.errors5xx)} />
        <MetricCard title="Avg latency" metric={asMetric(api?.avgLatencyMs)} format={fmtMs} />
      </div>

      <Card title="Recent failures" headingLevel={2} description="Failed probes seen by this backend instance since it started.">
        {data.recentFailures.length === 0 ? (
          <p className="ac-muted">No failed probes recorded.</p>
        ) : (
          <ul className="ac-failures">
            {data.recentFailures.map((f, i) => (
              <li key={`${f.at}-${i}`}><StatusBadge status={f.status} /><b>{NAMES[f.name] || f.name}</b><span>{f.detail || '—'}</span><time>{fmtTime(f.at)}</time></li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}
