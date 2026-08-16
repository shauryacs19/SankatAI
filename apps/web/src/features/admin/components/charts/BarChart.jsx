// Lightweight responsive bar chart (pure SVG). Supports single or grouped bars.
// data: [{ label, <key>: number, ... }]
// bars: [{ key, color, label }]

export default function BarChart({ data = [], bars = [], height = 160 }) {
  const W = 360
  const H = height
  const padX = 8
  const padTop = 12
  const padBottom = 22
  const innerW = W - padX * 2
  const innerH = H - padTop - padBottom
  const keys = bars.map((b) => b.key)
  const n = data.length || 1
  const max = Math.max(1, ...data.flatMap((d) => keys.map((k) => Number(d[k]) || 0)))
  const groupW = innerW / n
  const barW = Math.min(40, (groupW * 0.66) / keys.length)
  const baseline = padTop + innerH

  return (
    <svg className="ac-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Bar chart">
      {[0.25, 0.5, 0.75, 1].map((f, i) => {
        const gy = baseline - f * innerH
        return <line key={i} x1={padX} y1={gy} x2={W - padX} y2={gy} stroke="var(--border-subtle, #E5E7EB)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      })}

      {data.map((d, i) => {
        const groupCenter = padX + i * groupW + groupW / 2
        const startX = groupCenter - (keys.length * barW) / 2
        return (
          <g key={i}>
            {bars.map((b, j) => {
              const v = Number(d[b.key]) || 0
              const h = (v / max) * innerH
              const bx = startX + j * barW
              return <rect key={b.key} x={bx + 2} y={baseline - h} width={Math.max(4, barW - 4)} height={Math.max(0, h)} rx="4" fill={b.color} />
            })}
            <text x={groupCenter} y={H - 7} textAnchor="middle" className="ac-axis">{d.label}</text>
          </g>
        )
      })}
    </svg>
  )
}
