// System health — MOCK values (not wired to AWS monitoring yet).
import { CheckCircle2, AlertTriangle, XCircle } from 'lucide-react'

const STATUS_META = {
  operational: { label: 'Operational', Icon: CheckCircle2, cls: 'ok' },
  degraded: { label: 'Degraded', Icon: AlertTriangle, cls: 'warn' },
  down: { label: 'Down', Icon: XCircle, cls: 'down' },
}

export default function SystemHealth({ data }) {
  if (!data) return null
  return (
    <section className="ac-card ac-panel">
      <div className="ac-panel-head">
        <h3>System Health</h3>
        <span className="ac-mock-pill" title="These values are placeholders, not live AWS monitoring">Mock values</span>
      </div>
      <div className="ac-health-list">
        {data.services.map((s) => {
          const meta = STATUS_META[s.status] || STATUS_META.operational
          return (
            <div key={s.name} className="ac-health-row">
              <span className="ac-health-name">{s.name}</span>
              <span className={`ac-health-status ${meta.cls}`}><meta.Icon size={14} /> {meta.label}</span>
            </div>
          )
        })}
      </div>
      <div className="ac-substats ac-substats-grid">
        <div className="ac-substat"><span>API availability</span><b className="ac-ok-text">{data.apiAvailability}%</b></div>
        <div className="ac-substat"><span>Avg API latency</span><b>{data.apiLatency}ms</b></div>
        <div className="ac-substat"><span>Error rate</span><b>{data.errorRate}%</b></div>
      </div>
    </section>
  )
}
