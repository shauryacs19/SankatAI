// Lightweight donut chart (pure SVG). segments: [{ label, value, color }]

export default function DonutChart({ segments = [], size = 136, thickness = 19, centerLabel, centerSub }) {
  const total = segments.reduce((s, x) => s + (Number(x.value) || 0), 0) || 1
  const r = (size - thickness) / 2
  const c = 2 * Math.PI * r
  const cx = size / 2
  const cy = size / 2

  // Precompute each segment's arc length + cumulative start offset without
  // mutating a shared variable during render.
  const dashes = segments.map((seg) => ((Number(seg.value) || 0) / total) * c)
  const startOffset = (i) => dashes.slice(0, i).reduce((a, b) => a + b, 0)
  const arcs = segments.map((seg, i) => (
    <circle
      key={seg.label}
      cx={cx}
      cy={cy}
      r={r}
      fill="none"
      stroke={seg.color}
      strokeWidth={thickness}
      strokeDasharray={`${dashes[i]} ${c - dashes[i]}`}
      strokeDashoffset={-startOffset(i)}
      strokeLinecap="butt"
    />
  ))

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label="Distribution donut chart">
      <g transform={`rotate(-90 ${cx} ${cy})`}>
        <circle cx={cx} cy={cy} r={r} fill="none" stroke="var(--surface-2, #F1F5F9)" strokeWidth={thickness} />
        {arcs}
      </g>
      {centerLabel != null && (
        <text x={cx} y={cy - 2} textAnchor="middle" className="ac-donut-center">{centerLabel}</text>
      )}
      {centerSub != null && (
        <text x={cx} y={cy + 16} textAnchor="middle" className="ac-donut-sub">{centerSub}</text>
      )}
    </svg>
  )
}
