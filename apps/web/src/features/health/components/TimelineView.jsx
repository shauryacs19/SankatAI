// Health timeline: AI assessments, report uploads/analyses, symptom entries and
// medicines read from reports, drawn on a zoomable flow canvas. Category
// filters float over the canvas; a selected event opens a details panel.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { Activity, FileText, MessageSquare, Pill, History as HistoryIcon, Stethoscope } from 'lucide-react'
import { Button, EmptyState, ErrorState, SeverityBadge, Skeleton } from '../../../components/ui'
import { errText } from '../../../utils/errText'
import { getTimeline } from '../services/healthApi'
import TimelineCanvas, { CanvasPanel } from './TimelineCanvas.jsx'
import DoctorReportModal from './DoctorReport.jsx'

const CATS = [
  { value: 'assessment', label: 'AI checks', kind: 'AI assessment', Icon: MessageSquare },
  { value: 'report', label: 'Reports', kind: 'Report', Icon: FileText },
  { value: 'symptom', label: 'Symptoms', kind: 'Symptom', Icon: Activity },
  { value: 'medication', label: 'Medicines', kind: 'Medicines', Icon: Pill },
]
const CAT = Object.fromEntries(CATS.map((c) => [c.value, c]))
const full = (iso) => new Date(iso).toLocaleString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })

export default function TimelineView({ onOpenReport }) {
  const navigate = useNavigate()
  const d = useOutletContext()
  const [all, setAll] = useState(null)
  const [hidden, setHidden] = useState([]) // categories switched off
  const [error, setError] = useState('')
  const [retrying, setRetrying] = useState(false)
  const [focusId, setFocusId] = useState(null)
  const [picked, setPicked] = useState(() => new Set()) // records chosen for a doctor report
  const [report, setReport] = useState(null) // { kind: 'selection', ids, title } while the dialog is open

  const load = useCallback(() => getTimeline()
    .then((r) => { setAll(r.events); setError('') })
    .catch((err) => setError(errText(err, 'Could not load your timeline.'))), [])
  useEffect(() => {
    getTimeline().then((r) => { setAll(r.events); setError('') }).catch((err) => setError(errText(err, 'Could not load your timeline.')))
  }, [])

  // One array per (data, filter): the canvas returns to its starting view only when this changes.
  const events = useMemo(() => (all ? all.filter((e) => !hidden.includes(e.category)) : null), [all, hidden])

  const action = (e) => {
    const det = e.details || {}
    if (e.category === 'assessment') { d.selectConsultation(det.consultationId); navigate('/dashboard/chat') }
    else if (det.kind === 'analysis' || e.category === 'medication') onOpenReport(det.attachmentId)
    else if (e.category === 'symptom') navigate('/dashboard/symptoms')
    else navigate('/dashboard/reports')
  }
  const toggle = (v) => { setFocusId(null); setHidden((h) => (h.includes(v) ? h.filter((x) => x !== v) : [...h, v])) }
  const focused = events?.find((e) => e.id === focusId) || null
  // Only what is on screen goes into a report (a hidden category is left out).
  const chosen = (events || []).filter((e) => picked.has(e.id))
  const pick = (ids, on) => setPicked((cur) => { const next = new Set(cur); for (const id of ids) { if (on) next.add(id); else next.delete(id) } return next })
  const openReport = () => {
    const times = chosen.map((e) => e.at).sort()
    const day = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    setReport({ kind: 'selection', ids: chosen.map((e) => e.id), title: `${chosen.length} selected record${chosen.length === 1 ? '' : 's'}, ${day(times[0])} – ${day(times.at(-1))}` })
  }
  const present = new Set((all || []).map((e) => e.category))

  if (error) {
    return <div className="pg"><ErrorState title="Couldn't load your timeline" description={error} retrying={retrying}
      onRetry={async () => { setRetrying(true); await load(); setRetrying(false) }} /></div>
  }
  if (events === null) return <div className="tl-wrap" aria-busy="true" aria-label="Loading timeline"><Skeleton height="100%" /></div>
  if (all.length === 0) {
    return <div className="pg"><EmptyState icon={HistoryIcon} title="Your timeline is empty"
      description="Chats with SankatAI, uploaded reports and the symptoms you record will appear here in date order." /></div>
  }

  const filters = (
    <div className="fc-chips" role="group" aria-label="Show categories">
      {CATS.filter((c) => present.has(c.value)).map((c) => (
        <button key={c.value} type="button" className={`fc-chip fc-chip--${c.value}`} aria-pressed={!hidden.includes(c.value)} onClick={() => toggle(c.value)}>
          <c.Icon size={14} aria-hidden="true" />{c.label}
        </button>
      ))}
    </div>
  )
  const FocusIcon = focused ? CAT[focused.category].Icon : null
  const det = focused?.details || {}

  return (
    <div className="tl-wrap">
      {events.length ? (
        <TimelineCanvas events={events} cats={CATS} selectedId={focusId} filters={filters} picked={picked} onPick={pick}
          onSelect={(id) => setFocusId((cur) => (cur === id ? null : id))} onAction={action}>
          <div className="fc-selbar" role="region" aria-label="Doctor report from selected records">
            <span className="fc-selbar-text" aria-live="polite">
              {chosen.length ? `${chosen.length} record${chosen.length === 1 ? '' : 's'} selected` : 'Tick weeks or records to build a doctor report'}
            </span>
            {chosen.length > 0 && <Button size="sm" variant="ghost" onClick={() => setPicked(new Set())}>Clear</Button>}
            {chosen.length < events.length && <Button size="sm" variant="ghost" onClick={() => pick(events.map((e) => e.id), true)}>Select all</Button>}
            <Button size="sm" variant="primary" icon={Stethoscope} disabled={!chosen.length} onClick={openReport}>Generate doctor report</Button>
          </div>
        </TimelineCanvas>
      ) : (
        <div className="fc fc--empty">{<div className="fc-filters">{filters}</div>}<p className="hr-muted">All categories are hidden. Switch one on above.</p></div>
      )}
      {report && <DoctorReportModal source={report} onClose={() => setReport(null)} />}
      {focused && (
        <CanvasPanel onClose={() => setFocusId(null)}>
          <div className="fc-panel-head">
            <span className={`fc-node-ic fc-node-ic--${focused.category}`}><FocusIcon size={16} aria-hidden="true" /></span>
            <div>
              <p className="fc-node-kind">{CAT[focused.category].kind}</p>
              <h2 className="fc-panel-title">{focused.title}</h2>
            </div>
          </div>
          <dl className="fc-panel-rows">
            <div><dt>When</dt><dd><time dateTime={focused.at}>{full(focused.at)}</time></dd></div>
            {focused.severity && <div><dt>Risk</dt><dd><SeverityBadge severity={focused.severity} /></dd></div>}
            {det.severity != null && <div><dt>Severity</dt><dd>{det.severity}/10</dd></div>}
            {det.notes && <div><dt>Notes</dt><dd>{det.notes}</dd></div>}
            {det.summary && <div><dt>Summary</dt><dd>{det.summary}</dd></div>}
            {det.kind === 'analysis' && <div><dt>Result</dt><dd>{det.abnormalCount > 0 ? `${det.abnormalCount} outside printed range` : 'All in printed range'}</dd></div>}
            {det.medications && <div><dt>Medicines</dt><dd>{det.medications.join(' · ')}</dd></div>}
          </dl>
          <Button size="sm" variant="primary" onClick={() => action(focused)}>
            {focused.category === 'assessment' ? 'Open chat' : det.kind === 'analysis' || focused.category === 'medication' ? 'View analysis' : focused.category === 'symptom' ? 'Go to symptoms' : 'Go to lab reports'}
          </Button>
          {focused.category === 'assessment' && <p className="hr-note">AI estimate, not a diagnosis.</p>}
        </CanvasPanel>
      )}
    </div>
  )
}
