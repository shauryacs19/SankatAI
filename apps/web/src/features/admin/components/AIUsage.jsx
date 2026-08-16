// AI usage: request volume, success/failure, latency + requests-over-time chart.
import { fmt, CHART } from '../format'
import LineChart from './charts/LineChart.jsx'

export default function AIUsage({ data }) {
  if (!data) return null
  return (
    <section className="ac-card ac-panel">
      <div className="ac-panel-head"><h3>AI Usage</h3></div>
      <div className="ac-substats ac-substats-grid">
        <div className="ac-substat"><span>AI requests</span><b>{fmt(data.requests)}</b></div>
        <div className="ac-substat"><span>Successful responses</span><b>{fmt(data.successful)}</b></div>
        <div className="ac-substat"><span>Failed responses</span><b className="ac-danger-text">{fmt(data.failed)}</b></div>
        <div className="ac-substat"><span>Success rate</span><b className="ac-ok-text">{data.successRate}%</b></div>
        <div className="ac-substat"><span>Avg response time</span><b>{data.avgResponseTime}s</b></div>
        <div className="ac-substat"><span>Avg requests / chat</span><b>{data.avgPerChat}</b></div>
      </div>
      <div className="ac-chart-label">AI requests over time</div>
      <LineChart data={data.series || []} lines={[{ key: 'value', color: CHART.primary, label: 'Requests', fill: true }]} height={150} />
    </section>
  )
}
