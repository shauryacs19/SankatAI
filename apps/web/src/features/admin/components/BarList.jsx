// Horizontal bars for a part-to-whole or ranking (e.g. triage severity, feature
// usage). Each row carries its label and value as text, so identity and
// magnitude never depend on colour. Unavailable rows say so instead of 0.
import { fmt } from '../format'

export default function BarList({ items, format = fmt, label }) {
  const max = Math.max(1, ...items.map((i) => (typeof i.value === 'number' ? i.value : 0)))
  return (
    <ul className="ac-barlist" aria-label={label}>
      {items.map((item) => {
        const has = typeof item.value === 'number'
        return (
          <li key={item.key} title={has ? `${item.label}: ${format(item.value)}` : `${item.label}: ${item.unavailable || 'Unavailable'}`}>
            <div className="ac-barlist-head">
              <span>{item.label}</span>
              <b className={has ? '' : 'ac-unavailable'}>{has ? format(item.value) : 'Unavailable'}</b>
            </div>
            <div className="ac-barlist-track" aria-hidden="true">
              {has && item.value > 0 && (
                <span style={{ width: `${(item.value / max) * 100}%`, background: item.color || 'var(--viz-1)' }} />
              )}
            </div>
            {!has && item.unavailable && <p className="ac-metric-note">{item.unavailable}</p>}
          </li>
        )
      })}
    </ul>
  )
}
