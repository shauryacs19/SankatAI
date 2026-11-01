// AI medical report analyzer. Lists the user's Documents-vault files; "Analyse"
// runs the backend analysis (background job, polled here) and the result shows
// every parameter with its printed reference range, the high/low flag the
// backend computed, and a plain-language explanation. Results are saved on the
// document, so earlier analyses reopen instantly.

import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowDown, ArrowUp, CheckCircle2, FileText, Lock, Minus, Sparkles, Upload } from 'lucide-react'
import { Alert, Badge, Button, Card, EmptyState, ErrorState, Skeleton, Spinner, useToast } from '../../../components/ui'
import { errText } from '../../../utils/errText'
import { analyzeReport, getReport, listReports } from '../services/healthApi'

const POLL_MS = 2500
const POLL_LIMIT = 48 // ~2 minutes
const STATUS = {
  high: { label: 'High', Icon: ArrowUp, tone: 'warning' },
  low: { label: 'Low', Icon: ArrowDown, tone: 'warning' },
  normal: { label: 'In range', Icon: CheckCircle2, tone: 'success' },
  not_assessed: { label: 'Not assessed', Icon: Minus, tone: 'neutral' },
}
const date = (iso) => (iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '')

function StatusBadge({ report }) {
  if (report.status === 'processing') return <Badge><Spinner /> Analysing…</Badge>
  if (report.status === 'failed') return <Badge tone="danger" icon={AlertTriangle}>Failed</Badge>
  if (report.status === 'ready') {
    return report.abnormalCount > 0
      ? <Badge tone="warning" icon={AlertTriangle}>{report.abnormalCount} outside range</Badge>
      : <Badge tone="success" icon={CheckCircle2}>Analysed</Badge>
  }
  return null
}

function AnalysisView({ report }) {
  const a = report.analysis
  const sorted = [...a.parameters].sort((x, y) => Number(['high', 'low'].includes(y.status)) - Number(['high', 'low'].includes(x.status)))
  return (
    <Card title={report.filename} icon={FileText} description={[a.reportType, a.reportDate && `Report date ${a.reportDate}`, `Analysed ${date(report.analyzedAt)}`].filter(Boolean).join(' · ')}>
      <p>{a.summary}</p>
      {a.parameters.length > 0 ? (
        <div className="hr-table-wrap">
          <table className="hr-table">
            <caption className="sr-only">Test results from {report.filename}</caption>
            <thead><tr><th scope="col">Test</th><th scope="col">Result</th><th scope="col">Printed range</th><th scope="col">Flag</th></tr></thead>
            <tbody>
              {sorted.map((p, i) => {
                const s = STATUS[p.status] || STATUS.not_assessed
                return (
                  <tr key={`${p.name}-${i}`} className={['high', 'low'].includes(p.status) ? 'is-abnormal' : ''}>
                    <td>{p.name}{p.explanation && <div className="hr-expl">{p.explanation}</div>}</td>
                    <td className="num">{p.value} {p.unit}</td>
                    <td className="num">{p.referenceRange || <span className="hr-muted">Not stated in report</span>}</td>
                    <td><Badge tone={s.tone} icon={s.Icon}>{s.label}</Badge></td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      ) : <p className="hr-muted">No test values could be read from this document.</p>}
      {a.medications?.length > 0 && (
        <div><p className="ui-label">Medicines listed</p><ul>{a.medications.map((m) => <li key={m}>{m}</li>)}</ul></div>
      )}
      {!a.verifiedAgainstText && <Alert tone="info">Read from a photo by AI. Check each value against the original report.</Alert>}
      <p className="hr-note">{report.disclaimer}</p>
    </Card>
  )
}

export default function ReportAnalyzer({ openId, onOpened }) {
  const navigate = useNavigate()
  const toast = useToast()
  const [reports, setReports] = useState(null)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState(null) // full report view
  const [loadingId, setLoadingId] = useState(null)
  const polls = useRef({})

  const load = useCallback(async () => {
    try { const r = await listReports(); setReports(r.reports); setError('') } catch (err) { setError(errText(err, 'Could not load your documents.')) }
  }, [])
  useEffect(() => {
    listReports().then((r) => setReports(r.reports)).catch((err) => setError(errText(err, 'Could not load your documents.')))
  }, [])
  useEffect(() => () => Object.values(polls.current).forEach(clearTimeout), [])

  const replace = (r) => setReports((list) => (list || []).map((x) => (x.attachmentId === r.attachmentId ? { ...x, ...r } : x)))

  const open = useCallback(async (id) => {
    try { const r = await getReport(id); setSelected(r.status === 'ready' ? r : null); replace(r) } catch (err) { toast.error(errText(err, 'Could not open this analysis.')) }
    setLoadingId(null)
  }, [toast])

  // Deep link from the timeline (?report=id).
  useEffect(() => {
    if (!openId) return
    getReport(openId).then((r) => { setSelected(r.status === 'ready' ? r : null); replace(r) })
      .catch((err) => toast.error(errText(err, 'Could not open this analysis.')))
    onOpened?.()
  }, [openId]) // eslint-disable-line react-hooks/exhaustive-deps -- runs once per link

  const poll = (id, n = 0) => {
    polls.current[id] = setTimeout(async () => {
      try {
        const r = await getReport(id)
        replace(r)
        if (r.status === 'processing' && n < POLL_LIMIT) return poll(id, n + 1)
        if (r.status === 'ready') { setSelected(r); toast.success('Report analysed.') }
        else if (r.status === 'failed') toast.error(r.error || 'The report could not be analysed.')
        else toast.error('The analysis is taking too long. Check back in a moment.')
      } catch (err) { toast.error(errText(err, 'Lost track of the analysis. Refresh to check.')) }
    }, POLL_MS)
  }

  // An analysis started earlier (or in another tab) is still running: follow it.
  useEffect(() => {
    for (const r of reports || []) if (r.status === 'processing' && !polls.current[r.attachmentId]) poll(r.attachmentId)
  }, [reports]) // eslint-disable-line react-hooks/exhaustive-deps -- poll only reads refs + setters

  const analyse = async (id) => {
    try { const r = await analyzeReport(id); replace(r); setSelected(null); poll(id) } catch (err) { toast.error(errText(err, 'Could not start the analysis.')) }
  }

  if (error) return <ErrorState title="Couldn't load your documents" description={error} onRetry={load} />
  if (reports === null) return <Skeleton height="12rem" />

  return (
    <div className="hr-stack">
      <Card title="Your medical reports" icon={Sparkles}
        description="Upload a lab report (PDF or photo) to Documents, then analyse it. Values are compared only with the reference ranges printed on the report."
        actions={<Button size="sm" variant="secondary" icon={Upload} onClick={() => navigate('/documents/upload')}>Upload a report</Button>}>
        {reports.length === 0 ? (
          <EmptyState compact icon={FileText} title="No documents yet" description="Upload a blood test or other lab report to get a plain-language explanation."
            action={<Button variant="primary" icon={Upload} onClick={() => navigate('/documents/upload')}>Upload a report</Button>} />
        ) : (
          <ul role="list" className="hr-docs">
            {reports.map((r) => (
              <li key={r.attachmentId} className="hr-doc" aria-current={selected?.attachmentId === r.attachmentId ? 'true' : undefined}>
                <FileText size={18} aria-hidden="true" />
                <div className="hr-doc-main">
                  <div className="hr-doc-name">{r.filename}</div>
                  <div className="hr-row hr-muted">
                    <span>Uploaded {date(r.uploadedAt)}</span><StatusBadge report={r} />
                  </div>
                  {r.status === 'failed' && r.error && <p className="hr-note">{r.error}</p>}
                </div>
                {r.passwordProtected ? <Badge icon={Lock}>PIN-protected</Badge>
                  : r.status === 'ready' ? (
                    <span className="hr-row">
                      <Button size="sm" variant="secondary" loading={loadingId === r.attachmentId} onClick={() => { setLoadingId(r.attachmentId); void open(r.attachmentId) }}>View</Button>
                      <Button size="sm" variant="ghost" onClick={() => analyse(r.attachmentId)}>Re-analyse</Button>
                    </span>
                  ) : (
                    <Button size="sm" variant="primary" disabled={r.status === 'processing'} onClick={() => analyse(r.attachmentId)}>
                      {r.status === 'failed' ? 'Try again' : 'Analyse'}
                    </Button>
                  )}
              </li>
            ))}
          </ul>
        )}
      </Card>
      {selected && <AnalysisView report={selected} />}
    </div>
  )
}
