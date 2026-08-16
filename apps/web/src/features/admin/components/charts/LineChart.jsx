// Lightweight responsive line/area chart (pure SVG, no dependency).
// data: [{ label, <key>: number, ... }]
// lines: [{ key, color, label, fill?: boolean }]

export default function LineChart({ data = [], lines = [], height = 160 }) {
  const W = 360
  const H = height
  const padX = 8
  const padTop = 12
  const padBottom = 22
  const innerW = W - padX * 2
  const innerH = H - padTop - padBottom
  const keys = lines.map((l) => l.key)
  const n = data.length
  const max = Math.max(1, ...data.flatMap((d) => keys.map((k) => Number(d[k]) || 0)))
  const min = 0

  const x = (i) => padX + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW)
  const y = (v) => padTop + innerH - ((v - min) / (max - min)) * innerH
  const path = (key) => data.map((d, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(Number(d[key]) || 0).toFixed(1)}`).join(' ')
  const area = (key) => `${path(key)} L ${x(n - 1).toFixed(1)} ${(padTop + innerH).toFixed(1)} L ${x(0).toFixed(1)} ${(padTop + innerH).toFixed(1)} Z`

  const gridY = [0.25, 0.5, 0.75, 1].map((f) => padTop + innerH - f * innerH)
  const labelStep = Math.max(1, Math.ceil(n / 5))

  return (
    <svg className="ac-svg" viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" role="img" aria-label="Line chart">
      <defs>
        {lines.filter((l) => l.fill).map((l) => (
          <linearGradient key={l.key} id={`ac-grad-${l.key}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={l.color} stopOpacity="0.22" />
            <stop offset="100%" stopColor={l.color} stopOpacity="0" />
          </linearGradient>
        ))}
      </defs>

      {gridY.map((gy, i) => (
        <line key={i} x1={padX} y1={gy} x2={W - padX} y2={gy} stroke="var(--border-subtle, #E5E7EB)" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      ))}

      {lines.filter((l) => l.fill).map((l) => (
        <path key={`a-${l.key}`} d={area(l.key)} fill={`url(#ac-grad-${l.key})`} stroke="none" />
      ))}
      {lines.map((l) => (
        <path key={`l-${l.key}`} d={path(l.key)} fill="none" stroke={l.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
      ))}

      {data.map((d, i) => (
        (i % labelStep === 0 || i === n - 1) && (
          <text key={i} x={x(i)} y={H - 7} textAnchor="middle" className="ac-axis">{d.label}</text>
        )
      ))}
    </svg>
  )
}
