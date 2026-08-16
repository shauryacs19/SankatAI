// Upload analytics (aggregated counts only — never file names / previews / keys).
import { fmt, CHART } from '../format'
import BarChart from './charts/BarChart.jsx'

const BARS = [
  { key: 'images', color: CHART.images, label: 'Images' },
  { key: 'documents', color: CHART.documents, label: 'Documents' },
]

export default function UploadAnalytics({ data }) {
  if (!data) return null
  return (
    <section className="ac-card ac-panel">
      <div className="ac-panel-head">
        <h3>Upload Analytics</h3>
        <div className="ac-legend">
          {BARS.map((b) => <span key={b.key} className="ac-legend-item"><i style={{ background: b.color }} />{b.label}</span>)}
        </div>
      </div>
      <div className="ac-substats">
        <div className="ac-substat"><span>Images uploaded</span><b>{fmt(data.images)}</b></div>
        <div className="ac-substat"><span>Documents uploaded</span><b>{fmt(data.documents)}</b></div>
        <div className="ac-substat"><span>Total uploads</span><b>{fmt(data.total)}</b></div>
      </div>
      <div className="ac-chart-label">Upload activity</div>
      <BarChart data={data.series || []} bars={BARS} height={150} />
    </section>
  )
}
