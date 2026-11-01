// Timeline as a flow canvas, one band per WEEK (Mon-Sun columns, so days line up
// like a calendar). Weeks stack top to bottom, oldest first; each event is a
// card in its weekday column, and arrows join the events in the order they
// happened -- across weeks the arrow drops down from one band into the next.
//
// - Pan: drag the background, scroll / trackpad, or the arrow keys.
// - Zoom: Ctrl/⌘ + scroll or pinch (around the pointer), the + / − buttons or
//   keys; "Fit" shows everything, 0 too.
// - Move: drag a card anywhere; arrows follow. Positions are a per-browser
//   preference ("Reset layout" undoes them). Dates never change.
// - Select: click a card (or its title with Enter) -> details panel.
// - Pick for a doctor report: the check box on a week band (whole week) or on a card.

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Check, ChevronRight, LayoutGrid, Maximize, Minus, Plus, X } from 'lucide-react'
import { IconButton, SeverityBadge } from '../../../components/ui'

const W = 248 // card width
const H = 132 // card height (fixed so the layout is stable)
const GAP_X = 96
const GAP_Y = 44
const WEEK_HEAD = 44 // week title inside the band
const DAY_HEAD = 30 // weekday label above each column
const WEEK_GAP = 80 // space between week bands (the cross-week arrow runs here)
const BAND_PAD = 20 // band inset around its cards
const PAD = 48
const MIN_K = 0.2
const MAX_K = 2
const POS_KEY = 'sankatai.timeline.positions'
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v))
const loadPos = () => { try { return JSON.parse(localStorage.getItem(POS_KEY)) || {} } catch { return {} } }
const savePos = (p) => { try { localStorage.setItem(POS_KEY, JSON.stringify(p)) } catch { /* preference only */ } }

const DAY = 86400000
const dayOf = (iso) => { const d = new Date(iso); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() }
const weekdayOf = (t) => (new Date(t).getDay() + 6) % 7 // Monday = 0
const weekOf = (iso) => { const d = dayOf(iso); const m = new Date(d); m.setDate(m.getDate() - weekdayOf(d)); return m.getTime() }
const dayLabel = (t) => new Date(t).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })
const weekLabel = (start) => {
  const end = new Date(start); end.setDate(end.getDate() + 6)
  const f = (t, o) => new Date(t).toLocaleDateString(undefined, o)
  return `Week of ${f(start, { day: 'numeric', month: 'short' })} – ${f(end, { day: 'numeric', month: 'short', year: 'numeric' })}`
}
const BAND_W = 7 * W + 6 * GAP_X
const timeOf = (iso) => new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })

// Key facts shown on a card, per kind of event.
function rows(e) {
  const d = e.details || {}
  const out = [['Time', timeOf(e.at)]]
  if (e.category === 'assessment') out.push(['Risk', e.severity ? <SeverityBadge severity={e.severity} /> : 'Not rated'])
  else if (e.category === 'symptom') { out.push(['Severity', `${d.severity}/10`]); if (d.notes) out.push(['Notes', d.notes]) }
  else if (d.kind === 'analysis') out.push(['Result', d.abnormalCount > 0 ? `${d.abnormalCount} outside printed range` : 'All in printed range'])
  else if (e.category === 'medication') out.push(['Medicines', `${d.medications.length}: ${d.medications[0]}`])
  else out.push(['Type', 'Document uploaded'])
  return out
}

// Next week: down from the card into the gap above the next band, across to just
// left of the target column, down to its middle and in from the left.
function weekConnector(a, b, gapY) {
  const x1 = a.x + W / 2, y1 = a.y + H, xl = b.x - GAP_X / 2, y2 = b.y + H / 2
  return { d: `M${x1},${y1} V${gapY} H${xl} V${y2} H${b.x}`, p1: [x1, y1], p2: [b.x, y2] }
}

// Ports: horizontal neighbours join right->left, stacked ones bottom->top.
function connector(a, b) {
  const ax = a.x + W / 2, ay = a.y + H / 2, bx = b.x + W / 2, by = b.y + H / 2
  if (Math.abs(bx - ax) >= Math.abs(by - ay)) {
    const dir = bx >= ax ? 1 : -1
    const x1 = ax + (dir * W) / 2, x2 = bx - (dir * W) / 2
    const c = Math.max(40, Math.abs(x2 - x1) / 2) * dir
    return { d: `M${x1},${ay} C${x1 + c},${ay} ${x2 - c},${by} ${x2},${by}`, p1: [x1, ay], p2: [x2, by] }
  }
  const dir = by >= ay ? 1 : -1
  const y1 = ay + (dir * H) / 2, y2 = by - (dir * H) / 2
  const c = Math.max(24, Math.abs(y2 - y1) / 2) * dir
  return { d: `M${ax},${y1} C${ax},${y1 + c} ${bx},${y2 - c} ${bx},${y2}`, p1: [ax, y1], p2: [bx, y2] }
}

export default function TimelineCanvas({ events, cats, selectedId, onSelect, onAction, filters, picked, onPick, children }) {
  const ref = useRef(null)
  const [size, setSize] = useState({ w: 900, h: 600 })
  const [cam, setCam] = useState(null) // { x, y, k }: screen = world * k + (x, y)
  const [custom, setCustom] = useState(loadPos)
  const gesture = useRef(null)
  const pointers = useRef(new Map())

  // Default layout: a band per week (only weeks with events), a column per
  // weekday, events top-to-bottom within their day.
  const layout = useMemo(() => {
    const sorted = [...events].sort((a, b) => new Date(a.at) - new Date(b.at))
    const starts = [...new Set(sorted.map((e) => weekOf(e.at)))]
    const weeks = []
    let y = 0
    for (const start of starts) {
      const inWeek = sorted.filter((e) => weekOf(e.at) === start)
      const perDay = {}
      for (const e of inWeek) perDay[weekdayOf(dayOf(e.at))] = (perDay[weekdayOf(dayOf(e.at))] || 0) + 1
      const rows = Math.max(...Object.values(perDay))
      const height = BAND_PAD + WEEK_HEAD + DAY_HEAD + rows * (H + GAP_Y) - GAP_Y + BAND_PAD
      weeks.push({ start, y, height, days: perDay })
      y += height + WEEK_GAP
    }
    const weekY = Object.fromEntries(weeks.map((w) => [w.start, w.y]))
    const count = {}
    const nodes = sorted.map((e) => {
      const wk = weekOf(e.at), c = weekdayOf(dayOf(e.at)), key = `${wk}:${c}`
      const r = (count[key] = (count[key] ?? -1) + 1)
      return { e, week: wk, x: c * (W + GAP_X), y: weekY[wk] + BAND_PAD + WEEK_HEAD + DAY_HEAD + r * (H + GAP_Y) }
    })
    return { nodes, weeks, weekY }
  }, [events])
  const { nodes, last, nowPill, bounds } = useMemo(() => {
    const ns = layout.nodes.map((n) => (custom[n.e.id] ? { ...n, ...custom[n.e.id] } : n))
    const end = ns.at(-1)
    const pill = end ? { x: end.x + W + 56, y: end.y + H / 2 - 14 } : null
    const xs = ns.flatMap((n) => [n.x, n.x + W]).concat(pill ? [pill.x + 70] : [], [-BAND_PAD, BAND_W + BAND_PAD])
    const ys = ns.flatMap((n) => [n.y, n.y + H]).concat(layout.weeks.flatMap((w) => [w.y, w.y + w.height]))
    return { nodes: ns, last: end, nowPill: pill, bounds: { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) } }
  }, [layout, custom])

  const fitCam = useCallback((sz = size) => {
    const bw = bounds.x1 - bounds.x0 + PAD * 2, bh = bounds.y1 - bounds.y0 + PAD * 2
    const k = clamp(Math.min(sz.w / bw, sz.h / bh, 1), MIN_K, MAX_K)
    return { k, x: (sz.w - (bounds.x1 - bounds.x0) * k) / 2 - bounds.x0 * k, y: (sz.h - (bounds.y1 - bounds.y0) * k) / 2 - bounds.y0 * k }
  }, [bounds, size])
  // First view: everything when it is readable, else the latest week, full width, at a readable zoom.
  const startCam = useCallback((sz) => {
    const f = fitCam(sz)
    if (f.k >= 0.6) return f
    const k = clamp((sz.w - PAD * 2) / (BAND_W + BAND_PAD * 2), 0.45, 0.85)
    const lastWeek = layout.weeks.at(-1)
    return { k, x: PAD - (bounds.x0) * k, y: Math.min(PAD - bounds.y0 * k, sz.h - PAD - (lastWeek.y + lastWeek.height) * k) }
  }, [fitCam, bounds, layout])

  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return undefined
    if (el.clientWidth) setSize({ w: el.clientWidth, h: el.clientHeight })
    if (typeof ResizeObserver === 'undefined') return undefined
    const ro = new ResizeObserver(([en]) => setSize({ w: en.contentRect.width, h: en.contentRect.height }))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  useEffect(() => () => setCam(null), [events]) // new filter -> starting view again

  const v = cam || startCam(size)
  const update = useCallback((fn) => setCam((c) => fn(c || startCam(size))), [startCam, size])
  const zoomAt = useCallback((f, px, py) => update((c) => {
    const k = clamp(c.k * f, MIN_K, MAX_K)
    return { k, x: px - ((px - c.x) / c.k) * k, y: py - ((py - c.y) / c.k) * k }
  }), [update])

  useEffect(() => {
    const el = ref.current
    if (!el) return undefined
    const onWheel = (e) => {
      e.preventDefault()
      const r = el.getBoundingClientRect()
      if (e.ctrlKey || e.metaKey) zoomAt(Math.exp(-e.deltaY * 0.004), e.clientX - r.left, e.clientY - r.top)
      else update((c) => ({ ...c, x: c.x - e.deltaX, y: c.y - e.deltaY }))
    }
    el.addEventListener('wheel', onWheel, { passive: false })
    return () => el.removeEventListener('wheel', onWheel)
  }, [zoomAt, update])

  const onPointerDown = (e) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return
    if (e.target.closest('.fc-check, .fc-selbar')) return // check boxes and the report bar are plain buttons
    if (e.target.closest('button, .fc-panel, .fc-tools, .fc-filters')) { if (!e.target.closest('.fc-node')) return }
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    const r = ref.current.getBoundingClientRect()
    if (pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      gesture.current = { pinch: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2 - r.left, my: (a.y + b.y) / 2 - r.top }
      return
    }
    const node = e.target.closest('.fc-node')
    const id = node?.dataset.id
    const n = id && nodes.find((x) => x.e.id === id)
    gesture.current = { sx: e.clientX, sy: e.clientY, lx: e.clientX, ly: e.clientY, moved: 0, id, start: n ? { x: n.x, y: n.y } : null }
  }
  const onPointerMove = (e) => {
    const g = gesture.current
    if (!g || !pointers.current.has(e.pointerId)) return
    pointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (g.pinch && pointers.current.size === 2) {
      const [a, b] = [...pointers.current.values()]
      const dist = Math.hypot(a.x - b.x, a.y - b.y)
      zoomAt(dist / g.pinch, g.mx, g.my)
      g.pinch = dist
      return
    }
    g.moved = Math.max(g.moved, Math.hypot(e.clientX - g.sx, e.clientY - g.sy))
    if (g.moved <= 4) return
    if (ref.current.hasPointerCapture && !ref.current.hasPointerCapture(e.pointerId)) ref.current.setPointerCapture(e.pointerId)
    if (g.id) {
      const pos = { x: Math.round(g.start.x + (e.clientX - g.sx) / v.k), y: Math.round(g.start.y + (e.clientY - g.sy) / v.k) }
      setCustom((c) => ({ ...c, [g.id]: pos }))
    } else {
      const dx = e.clientX - g.lx, dy = e.clientY - g.ly
      update((c) => ({ ...c, x: c.x + dx, y: c.y + dy }))
    }
    g.lx = e.clientX; g.ly = e.clientY
  }
  const onPointerUp = (e) => {
    pointers.current.delete(e.pointerId)
    const g = gesture.current
    if (pointers.current.size) return
    if (g?.id && g.moved > 4) setCustom((c) => { savePos(c); return c })
    else if (g?.id && !g.pinch) onSelect(g.id)
    gesture.current = null
  }

  const onKeyDown = (e) => {
    if (e.target !== ref.current) return
    const step = 80
    const map = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }
    if (map[e.key]) { e.preventDefault(); const [dx, dy] = map[e.key]; update((c) => ({ ...c, x: c.x + dx, y: c.y + dy })) }
    else if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomAt(1.25, size.w / 2, size.h / 2) }
    else if (e.key === '-' || e.key === '_') { e.preventDefault(); zoomAt(0.8, size.w / 2, size.h / 2) }
    else if (e.key === '0') { e.preventDefault(); setCam(fitCam()) }
  }
  const resetLayout = () => { setCustom({}); savePos({}) }
  const cat = Object.fromEntries(cats.map((c) => [c.value, c]))
  const dot = (v.k < 0.6 ? 40 : 20) * v.k // keep the dot grid calm when zoomed out

  return (
    <div ref={ref} className="fc" tabIndex={0} role="application"
      aria-label="Health timeline canvas. Drag or use arrow keys to move, plus and minus to zoom, 0 to fit. Tab to reach each event."
      style={{ backgroundSize: `${dot}px ${dot}px`, backgroundPosition: `${v.x}px ${v.y}px` }}
      onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp} onKeyDown={onKeyDown}>
      <div className="fc-world" style={{ transform: `translate(${v.x}px, ${v.y}px) scale(${v.k})` }}>
        {layout.weeks.map((w) => (
          <section key={w.start} className="fc-week" style={{ left: -BAND_PAD, top: w.y, width: BAND_W + BAND_PAD * 2, height: w.height }}
            aria-label={weekLabel(w.start)}>
            {(() => {
              const ids = nodes.filter((n) => n.week === w.start).map((n) => n.e.id)
              const count = ids.filter((id) => picked.has(id)).length
              const state = count === 0 ? 'false' : count === ids.length ? 'true' : 'mixed'
              return (
                <button type="button" role="checkbox" aria-checked={state} className="fc-check fc-weekcheck"
                  aria-label={`Select every record in the ${weekLabel(w.start).toLowerCase()}`}
                  onClick={() => onPick(ids, state !== 'true')}>
                  <span className="fc-box" aria-hidden="true">{state === 'true' ? <Check size={12} strokeWidth={3} /> : state === 'mixed' ? <Minus size={12} strokeWidth={3} /> : null}</span>
                  <span className="fc-week-title">{weekLabel(w.start)}</span>
                  {count > 0 && <span className="fc-week-count">{count} of {ids.length} selected</span>}
                </button>
              )
            })()}
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i} className={`fc-day${w.days[i] ? '' : ' fc-day--empty'}`}
                style={{ left: BAND_PAD + i * (W + GAP_X), top: BAND_PAD + WEEK_HEAD, width: W }}>{dayLabel(w.start + i * DAY + 3600000 * 2)}</span>
            ))}
          </section>
        ))}
        <svg className="fc-wires" style={{ left: bounds.x0 - 200, top: bounds.y0 - 200, width: bounds.x1 - bounds.x0 + 400, height: bounds.y1 - bounds.y0 + 400 }}
          viewBox={`${bounds.x0 - 200} ${bounds.y0 - 200} ${bounds.x1 - bounds.x0 + 400} ${bounds.y1 - bounds.y0 + 400}`} aria-hidden="true">
          <defs><marker id="fc-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" className="fc-arrowhead" /></marker></defs>
          {nodes.slice(1).map((n, i) => {
            const a = nodes[i]
            const w = a.week !== n.week ? weekConnector(a, n, layout.weekY[n.week] - WEEK_GAP / 2) : connector(a, n)
            return (
              <g key={n.e.id}>
                <path d={w.d} className="fc-wire" markerEnd="url(#fc-arrow)" />
                <circle cx={w.p1[0]} cy={w.p1[1]} r="3.5" className="fc-port" />
              </g>
            )
          })}
          {last && <path d={`M${last.x + W},${last.y + H / 2} L${nowPill.x - 2},${last.y + H / 2}`} className="fc-wire" markerEnd="url(#fc-arrow)" />}
        </svg>
        {nowPill && <span className="fc-now" style={{ left: nowPill.x, top: nowPill.y }}><span className="fc-now-dot" />NOW</span>}

        {nodes.map((n) => {
          const c = cat[n.e.category]
          const action = n.e.category === 'assessment' ? 'Open chat'
            : (n.e.details?.kind === 'analysis' || n.e.category === 'medication') ? 'View analysis'
              : n.e.category === 'symptom' ? 'Symptoms' : 'Lab reports'
          return (
            <article key={n.e.id} data-id={n.e.id} className={`fc-node fc-node--${n.e.category}${selectedId === n.e.id ? ' is-selected' : ''}${picked.has(n.e.id) ? ' is-picked' : ''}`}
              style={{ left: n.x, top: n.y, width: W, height: H }}>
              <div className="fc-node-head">
                <span className="fc-node-ic"><c.Icon size={14} aria-hidden="true" /></span>
                <div className="fc-node-titles">
                  <span className="fc-node-kind">{c.kind}</span>
                  <button type="button" className="fc-node-title" aria-pressed={selectedId === n.e.id}
                    onClick={(ev) => { if (ev.detail === 0) onSelect(n.e.id) }}>{n.e.title}</button>
                </div>
                <button type="button" role="checkbox" aria-checked={picked.has(n.e.id)} className="fc-check fc-cardcheck"
                  aria-label={`Include “${n.e.title}” in the doctor report`} onClick={() => onPick([n.e.id], !picked.has(n.e.id))}>
                  <span className="fc-box" aria-hidden="true">{picked.has(n.e.id) && <Check size={12} strokeWidth={3} />}</span>
                </button>
              </div>
              <dl className="fc-node-rows">
                {rows(n.e).map(([k, val]) => <div key={k}><dt>{k}</dt><dd>{val}</dd></div>)}
              </dl>
              <div className="fc-node-foot">
                <button type="button" className="fc-node-action" onClick={() => onAction(n.e)}>{action}<ChevronRight size={14} aria-hidden="true" /></button>
              </div>
            </article>
          )
        })}
      </div>

      <div className="fc-filters">{filters}</div>
      <div className="fc-tools" role="toolbar" aria-label="Canvas controls">
        <IconButton label="Zoom in" icon={Plus} size={16} tooltipSide="right" onClick={() => zoomAt(1.25, size.w / 2, size.h / 2)} />
        <IconButton label="Zoom out" icon={Minus} size={16} tooltipSide="right" onClick={() => zoomAt(0.8, size.w / 2, size.h / 2)} />
        <IconButton label="Fit all events" icon={Maximize} size={16} tooltipSide="right" onClick={() => setCam(fitCam())} />
        {Object.keys(custom).length > 0 && <IconButton label="Reset layout" icon={LayoutGrid} size={16} tooltipSide="right" onClick={resetLayout} />}
      </div>
      <span className="fc-zoomlabel" aria-live="polite">{Math.round(v.k * 100)}%</span>
      {children}
    </div>
  )
}

// Floating details for the selected event (rendered by TimelineView inside the canvas area).
export function CanvasPanel({ children, onClose }) {
  return (
    <aside className="fc-panel" aria-label="Event details">
      <IconButton label="Close details" icon={X} size={16} className="fc-panel-close" onClick={onClose} />
      {children}
    </aside>
  )
}
