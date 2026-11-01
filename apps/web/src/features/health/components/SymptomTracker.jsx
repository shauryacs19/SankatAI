// Symptom progression tracker: record a symptom (name, severity 1-10, when,
// notes), see each symptom's history as a chart + list, the computed direction
// (increasing / decreasing / stable) and an optional AI wording of that trend.

import { useCallback, useEffect, useState } from 'react'
import { Activity, Plus, Sparkles, Trash2 } from 'lucide-react'
import {
  Alert, Badge, Button, Card, ConfirmDialog, EmptyState, ErrorState, Field, IconButton, Input, Skeleton, Textarea, useToast,
} from '../../../components/ui'
import { errText } from '../../../utils/errText'
import { addSymptom, deleteSymptom, listSymptoms, summarizeSymptom } from '../services/healthApi'

const TREND = {
  increasing: { label: 'Ratings increasing', tone: 'warning' },
  decreasing: { label: 'Ratings decreasing', tone: 'neutral' },
  stable: { label: 'Ratings stable', tone: 'neutral' },
  insufficient: { label: 'Not enough entries for a trend', tone: 'neutral' },
}
const pad = (n) => String(n).padStart(2, '0')
const localNow = () => { const t = new Date(); return `${t.getFullYear()}-${pad(t.getMonth() + 1)}-${pad(t.getDate())}T${pad(t.getHours())}:${pad(t.getMinutes())}` }
const fmt = (iso) => new Date(iso).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
const short = (iso) => new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })

// Severity over time: one series, time-scaled x, fixed 1-10 y. Markers are
// focusable and show a tooltip; the entry list below is the table view.
function SeverityChart({ name, entries }) {
  const [tip, setTip] = useState(null)
  const W = 560, H = 180, L = 28, R = 12, T = 12, B = 24
  const times = entries.map((e) => new Date(e.recordedAt).getTime())
  const t0 = Math.min(...times), t1 = Math.max(...times)
  const x = (t) => (t1 === t0 ? (L + W - R) / 2 : L + ((t - t0) / (t1 - t0)) * (W - L - R))
  const y = (v) => T + ((10 - v) / 9) * (H - T - B)
  const pts = entries.map((e, i) => ({ e, cx: x(times[i]), cy: y(e.severity) }))
  return (
    <div className="hr-chart-wrap">
      <svg className="hr-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${name} severity over time, ${entries.length} entries, latest ${entries.at(-1).severity} out of 10`}>
        {[1, 4, 7, 10].map((v) => (
          <g key={v}><line className="grid" x1={L} x2={W - R} y1={y(v)} y2={y(v)} /><text className="axis" x={L - 8} y={y(v) + 4} textAnchor="end">{v}</text></g>
        ))}
        <text className="axis" x={L} y={H - 6}>{short(entries[0].recordedAt)}</text>
        {entries.length > 1 && <text className="axis" x={W - R} y={H - 6} textAnchor="end">{short(entries.at(-1).recordedAt)}</text>}
        {pts.length > 1 && <polyline className="line" points={pts.map((p) => `${p.cx},${p.cy}`).join(' ')} />}
        {pts.map((p) => (
          <g key={p.e.id}>
            <circle className="hit" cx={p.cx} cy={p.cy} r={12} tabIndex={0} aria-label={`${fmt(p.e.recordedAt)}: ${p.e.severity} out of 10`}
              onMouseEnter={() => setTip(p)} onMouseLeave={() => setTip(null)} onFocus={() => setTip(p)} onBlur={() => setTip(null)} />
            <circle className="dot" cx={p.cx} cy={p.cy} r={4} pointerEvents="none" />
          </g>
        ))}
      </svg>
      {tip && <div className="hr-tip" style={{ left: `${(tip.cx / W) * 100}%`, top: `${(tip.cy / H) * 100}%` }}>{fmt(tip.e.recordedAt)} · <strong>{tip.e.severity}/10</strong></div>}
    </div>
  )
}

function SymptomCard({ series, onDelete }) {
  const toast = useToast()
  const [summary, setSummary] = useState(null)
  const [busy, setBusy] = useState(false)
  const t = series.trend
  const trend = TREND[t.direction] || TREND.insufficient
  const summarize = async () => {
    setBusy(true)
    try { setSummary(await summarizeSymptom(series.name)) } catch (err) { toast.error(errText(err, 'Could not summarise this trend.')) }
    setBusy(false)
  }
  return (
    <Card title={series.name} icon={Activity} actions={<Badge tone={trend.tone}>{trend.label}</Badge>}>
      <p className="hr-muted">
        {t.count} entr{t.count === 1 ? 'y' : 'ies'} · latest {t.latest}/10
        {t.change != null && ` · average change ${t.change > 0 ? '+' : ''}${t.change} points`}
      </p>
      <SeverityChart name={series.name} entries={series.entries} />
      <ul role="list" className="hr-entries" aria-label={`${series.name} entries`}>
        {[...series.entries].reverse().map((e) => (
          <li key={e.id} className="hr-entry">
            <span className="hr-entry-sev">{e.severity}/10</span>
            <span className="hr-entry-main"><time dateTime={e.recordedAt}>{fmt(e.recordedAt)}</time>{e.notes && <span className="hr-muted"> — {e.notes}</span>}</span>
            <IconButton label={`Delete ${series.name} entry from ${fmt(e.recordedAt)}`} icon={Trash2} size={16} variant="danger" tooltip={false} onClick={() => onDelete(e)} />
          </li>
        ))}
      </ul>
      {series.entries.length > 1 && !summary && (
        <div><Button size="sm" variant="secondary" icon={Sparkles} loading={busy} loadingText="Summarising…" onClick={summarize}>Summarise trend</Button></div>
      )}
      {summary && (
        <div className="hr-summary" role="status">
          <p>{summary.summary}</p>
          <p className="hr-note">{summary.source === 'ai' ? 'AI summary. ' : ''}{summary.disclaimer}</p>
        </div>
      )}
    </Card>
  )
}

export default function SymptomTracker() {
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', severity: 5, when: localNow(), notes: '' })
  const [formError, setFormError] = useState({})
  const [saving, setSaving] = useState(false)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)

  const load = useCallback(async () => {
    try { const r = await listSymptoms(); setData(r); setError('') } catch (err) { setError(errText(err, 'Could not load your symptoms.')) }
  }, [])
  useEffect(() => {
    listSymptoms().then((r) => setData(r)).catch((err) => setError(errText(err, 'Could not load your symptoms.')))
  }, [])

  const submit = async (ev) => {
    ev.preventDefault()
    const errs = {}
    if (!form.name.trim()) errs.name = 'Enter the symptom, for example “headache”.'
    const when = form.when ? new Date(form.when) : new Date()
    if (Number.isNaN(when.getTime())) errs.when = 'Enter a valid date and time.'
    else if (when.getTime() > Date.now() + 5 * 60000) errs.when = "The date and time can't be in the future."
    setFormError(errs)
    if (Object.keys(errs).length) return
    setSaving(true)
    try {
      await addSymptom({ name: form.name.trim(), severity: Number(form.severity), recordedAt: when.toISOString(), notes: form.notes.trim() })
      toast.success('Symptom recorded.')
      setForm((f) => ({ ...f, notes: '', when: localNow() }))
      await load()
    } catch (err) { toast.error(errText(err, 'Could not save this entry.')) }
    setSaving(false)
  }

  const confirmDelete = async () => {
    setDeleting(true)
    try { await deleteSymptom(toDelete.id); toast.success('Entry deleted.'); setToDelete(null); await load() } catch (err) { toast.error(errText(err, 'Could not delete this entry.')) }
    setDeleting(false)
  }

  const names = [...new Set((data?.symptoms || []).map((s) => s.name))]
  return (
    <div className="hr-stack">
      <Card title="Record a symptom" icon={Plus}>
        <form className="hr-form" onSubmit={submit} noValidate>
          <Field label="Symptom" required error={formError.name}>
            <Input value={form.name} maxLength={60} list="hr-symptom-names" placeholder="e.g. Headache" autoComplete="off"
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <datalist id="hr-symptom-names">{names.map((n) => <option key={n} value={n} />)}</datalist>
          <Field label="Date and time" error={formError.when}>
            <Input type="datetime-local" value={form.when} max={localNow()} onChange={(e) => setForm({ ...form, when: e.target.value })} />
          </Field>
          <div className="ui-field hr-span">
            <label htmlFor="hr-sev" className="ui-label">Severity (1 = very mild, 10 = worst)</label>
            <div className="hr-sev">
              <input id="hr-sev" type="range" min={1} max={10} step={1} value={form.severity} aria-valuetext={`${form.severity} out of 10`}
                onChange={(e) => setForm({ ...form, severity: Number(e.target.value) })} />
              <span className="hr-sev-val" aria-hidden="true">{form.severity}/10</span>
            </div>
          </div>
          <Field label="Notes" optional className="hr-span">
            <Textarea value={form.notes} maxLength={500} rows={2} placeholder="What makes it better or worse? Any medicine taken?" onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
          <div className="hr-span"><Button type="submit" variant="primary" icon={Plus} loading={saving} loadingText="Saving…">Add entry</Button></div>
        </form>
        {form.severity >= 8 && <Alert tone="warning">A severe or suddenly worse symptom needs a doctor. If it is an emergency, call 112.</Alert>}
      </Card>

      {error ? <ErrorState title="Couldn't load your symptoms" description={error} onRetry={load} />
        : data === null ? <Skeleton height="12rem" />
          : data.symptoms.length === 0 ? (
            <EmptyState icon={Activity} title="No symptoms recorded yet" description="Add an entry each day to see how a symptom changes over time." />
          ) : data.symptoms.map((s) => <SymptomCard key={s.name.toLowerCase()} series={s} onDelete={setToDelete} />)}
      <p className="hr-note">Trends describe the ratings you entered. A change in ratings does not confirm that a condition is improving or getting worse.</p>

      <ConfirmDialog open={Boolean(toDelete)} onClose={() => !deleting && setToDelete(null)} onConfirm={confirmDelete} busy={deleting}
        icon={Trash2} title="Delete this entry?" description={toDelete ? `${toDelete.name}, ${toDelete.severity}/10 on ${fmt(toDelete.recordedAt)}.` : ''} confirmLabel="Delete entry" />
    </div>
  )
}
