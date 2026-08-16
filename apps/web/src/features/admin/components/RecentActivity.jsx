// Recent activity — anonymized/mock events only (no PII, no chat content).
// Compact list layout so it fits a narrow dashboard column.

const STATUS_CLS = { success: 'ok', alert: 'alert', warning: 'warn' }
const STATUS_LABEL = { success: 'Success', alert: 'Alert', warning: 'Warning' }

export default function RecentActivity({ data }) {
  if (!data) return null
  return (
    <section className="ac-card ac-panel">
      <div className="ac-panel-head"><h3>Recent Activity</h3></div>
      <div className="ac-activity">
        {data.map((row, i) => (
          <div key={i} className="ac-activity-row">
            <div className="ac-activity-main">
              <span className="ac-activity-event" title={row.event}>{row.event}</span>
              <span className="ac-cat">{row.category}</span>
            </div>
            <div className="ac-activity-meta">
              <span className={`ac-status ${STATUS_CLS[row.status] || 'ok'}`}>{STATUS_LABEL[row.status] || 'Success'}</span>
              <span className="ac-activity-time">{row.time}</span>
            </div>
          </div>
        ))}
      </div>
    </section>
  )
}
