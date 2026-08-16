// Conversation severity distribution (aggregated only — no user content).
import { fmt, CHART } from '../format'
import DonutChart from './charts/DonutChart.jsx'

export default function SeverityAnalytics({ data }) {
  if (!data) return null
  const segments = [
    { label: 'Critical', value: data.critical, color: CHART.sevCritical },
    { label: 'High', value: data.high, color: CHART.sevHigh },
    { label: 'Medium', value: data.medium, color: CHART.sevMedium },
    { label: 'Low', value: data.low, color: CHART.sevLow },
  ]
  const elevated = (data.critical || 0) + (data.high || 0)

  return (
    <section className="ac-card ac-panel">
      <div className="ac-panel-head"><h3>Severity Distribution</h3></div>
      <div className="ac-severity">
        <DonutChart segments={segments} centerLabel={`${elevated}%`} centerSub="elevated" />
        <div className="ac-severity-legend">
          {segments.map((s) => (
            <div key={s.label} className="ac-severity-row">
              <span className="ac-legend-item"><i style={{ background: s.color }} />{s.label}</span>
              <b>{s.value}%</b>
            </div>
          ))}
        </div>
      </div>
      <div className="ac-substats">
        <div className="ac-substat"><span>Critical conversations</span><b className="ac-danger-text">{fmt(data.criticalCount)}</b></div>
        <div className="ac-substat"><span>High-severity conversations</span><b>{fmt(data.highCount)}</b></div>
      </div>
    </section>
  )
}
