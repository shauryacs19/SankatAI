// Time-series chart (line or stacked bars), pure SVG.
//
// - null = "not recorded" and is drawn as a gap, never as zero.
// - Hover or arrow keys move a crosshair; the tooltip lists every series.
// - >= 2 series get a legend; every chart has a table view (the accessible
//   alternative, and relief for the one light-mode slot below 3:1 contrast).
// - One y-axis only. Text uses text tokens, never the series colour.
import { useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Table2, LineChart as LineIcon } from 'lucide-react'
import { labelFor, fmt } from '../format'

const H_PAD = { top: 12, right: 12, bottom: 26, left: 40 }

// Re-attaches when the plot remounts (table view toggled off).
function useWidth(ref, remountKey, fallback = 560) {
  const [width, setWidth] = useState(fallback)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    // Measure now (first paint is right even where observers are throttled)...
    if (el.clientWidth) setWidth(Math.max(240, el.clientWidth))
    // ...and follow later resizes.
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([entry]) => setWidth(Math.max(240, Math.round(entry.contentRect.width))))
    ro.observe(el)
    return () => ro.disconnect()
  }, [ref, remountKey])
  return width
}

const niceMax = (v) => {
  if (v <= 4) return 4
  const pow = 10 ** Math.floor(Math.log10(v))
  const n = v / pow
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10
  return step * pow
}

export default function TimeSeriesChart({ title, labels = [], series = [], type = 'line', height = 200, format = fmt }) {
  const wrapRef = useRef(null)
  const [active, setActive] = useState(null)
  const [asTable, setAsTable] = useState(false)
  const width = useWidth(wrapRef, asTable)
  const tableId = useId()

  const n = labels.length
  const innerW = width - H_PAD.left - H_PAD.right
  const innerH = height - H_PAD.top - H_PAD.bottom
  const stacked = type === 'bar'

  const max = useMemo(() => {
    const totals = labels.map((_, i) => (stacked
      ? series.reduce((s, x) => s + (x.values[i] ?? 0), 0)
      : Math.max(0, ...series.map((x) => x.values[i] ?? 0))))
    return niceMax(Math.max(0, ...totals))
  }, [labels, series, stacked])

  const step = n > 0 ? innerW / n : innerW
  const xCenter = (i) => H_PAD.left + step * i + step / 2
  const y = (v) => H_PAD.top + innerH - (v / max) * innerH
  const labelEvery = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(innerW / 64))))

  const linePath = (values) => {
    let d = ''
    let pen = false
    values.forEach((v, i) => {
      if (v == null) { pen = false; return }
      d += `${pen ? 'L' : 'M'}${xCenter(i).toFixed(1)},${y(v).toFixed(1)} `
      pen = true
    })
    return d.trim()
  }

  const indexAt = (clientX) => {
    const rect = wrapRef.current?.getBoundingClientRect()
    if (!rect || !n) return null
    const i = Math.floor((clientX - rect.left - H_PAD.left) / step)
    return i >= 0 && i < n ? i : null
  }

  const onKeyDown = (e) => {
    if (!n) return
    if (e.key === 'ArrowRight') { e.preventDefault(); setActive((i) => (i == null ? 0 : Math.min(n - 1, i + 1))) }
    if (e.key === 'ArrowLeft') { e.preventDefault(); setActive((i) => (i == null ? n - 1 : Math.max(0, i - 1))) }
    if (e.key === 'Escape') setActive(null)
  }

  const barW = Math.max(2, Math.min(28, step - 2)) // 2px surface gap between bars
  const tipLeft = active == null ? 0 : Math.min(Math.max(xCenter(active) - 80, 0), width - 170)

  return (
    <figure className="ac-chart">
      <div className="ac-chart-tools">
        {series.length > 1 && (
          <ul className="ac-legend" aria-label="Legend">
            {series.map((s) => (
              <li key={s.key}><i style={{ background: s.color }} aria-hidden="true" />{s.label}</li>
            ))}
          </ul>
        )}
        <button type="button" className="ac-linkbtn" aria-pressed={asTable} aria-controls={tableId}
          onClick={() => setAsTable((v) => !v)}>
          {asTable ? <LineIcon size={14} aria-hidden="true" /> : <Table2 size={14} aria-hidden="true" />}
          {asTable ? 'Show chart' : 'Show table'}
        </button>
      </div>

      {asTable ? (
        <div className="ac-table-wrap" id={tableId}>
          <table className="ac-table">
            <caption className="sr-only">{title}</caption>
            <thead><tr><th scope="col">Period</th>{series.map((s) => <th key={s.key} scope="col">{s.label}</th>)}</tr></thead>
            <tbody>
              {labels.map((t, i) => (
                <tr key={t}>
                  <th scope="row">{labelFor(t, { long: true })}</th>
                  {series.map((s) => <td key={s.key}>{s.values[i] == null ? 'Not recorded' : format(s.values[i])}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div
          ref={wrapRef}
          className="ac-plot"
          tabIndex={0}
          role="img"
          aria-label={`${title}. Use the left and right arrow keys to read values, or show the table.`}
          onPointerMove={(e) => setActive(indexAt(e.clientX))}
          onPointerLeave={() => setActive(null)}
          onKeyDown={onKeyDown}
          onBlur={() => setActive(null)}
        >
          <svg width={width} height={height} aria-hidden="true">
            {[0, 0.5, 1].map((f) => (
              <g key={f}>
                <line x1={H_PAD.left} x2={width - H_PAD.right} y1={y(max * f)} y2={y(max * f)} className="ac-grid" />
                <text x={H_PAD.left - 6} y={y(max * f) + 4} textAnchor="end" className="ac-axis">{format(max * f)}</text>
              </g>
            ))}
            {labels.map((t, i) => (i % labelEvery === 0 ? (
              <text key={t} x={xCenter(i)} y={height - 8} textAnchor="middle" className="ac-axis">{labelFor(t)}</text>
            ) : null))}

            {active != null && (
              <line x1={xCenter(active)} x2={xCenter(active)} y1={H_PAD.top} y2={H_PAD.top + innerH} className="ac-crosshair" />
            )}

            {stacked
              ? labels.map((t, i) => {
                let base = 0
                return (
                  <g key={t}>
                    {series.map((s) => {
                      const v = s.values[i]
                      if (!v) return null
                      const y0 = y(base)
                      base += v
                      const y1 = y(base)
                      return (
                        <rect key={s.key} x={xCenter(i) - barW / 2} width={barW} y={y1}
                          height={Math.max(1, y0 - y1 - 1)} rx={Math.min(4, barW / 4)} fill={s.color}
                          opacity={active == null || active === i ? 1 : 0.55} />
                      )
                    })}
                  </g>
                )
              })
              : series.map((s) => (
                <g key={s.key}>
                  <path d={linePath(s.values)} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
                  {/* Isolated points (neighbours null) would be invisible as a line. */}
                  {s.values.map((v, i) => (v != null && s.values[i - 1] == null && s.values[i + 1] == null ? (
                    <circle key={i} cx={xCenter(i)} cy={y(v)} r="3" fill={s.color} />
                  ) : null))}
                  {active != null && s.values[active] != null && (
                    <circle cx={xCenter(active)} cy={y(s.values[active])} r="4.5" fill={s.color} className="ac-dot" />
                  )}
                </g>
              ))}
          </svg>

          {active != null && (
            <div className="ac-tip" role="tooltip" style={{ left: tipLeft }}>
              <p className="ac-tip-title">{labelFor(labels[active], { long: true })}</p>
              {series.map((s) => (
                <p key={s.key} className="ac-tip-row">
                  <i style={{ background: s.color }} aria-hidden="true" />
                  <span>{s.label}</span>
                  <b>{s.values[active] == null ? 'Not recorded' : format(s.values[active])}</b>
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </figure>
  )
}
