import { useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { Badge, Button, Card } from '../../../components/ui'
import { errText } from '../../../utils/errText'
import { getAuditLogs } from '../services/adminApi'
import { useAdminResource } from '../useAdminResource'
import { LoadError, NoData, PageSkeleton } from '../components/States.jsx'
import { fmtTime } from '../format'

const RESULT_TONE = { success: 'success', denied: 'danger', error: 'danger', partial: 'warning', noop: 'neutral' }
const short = (sub) => (sub && sub.length > 14 ? `${sub.slice(0, 8)}…${sub.slice(-4)}` : sub || '—')

export default function AuditPage() {
  const { refreshKey } = useOutletContext()
  const { data, refreshing, error, reload } = useAdminResource(() => getAuditLogs(), [refreshKey])
  const [more, setMore] = useState({ key: null, items: [], cursor: undefined })
  const [loadingMore, setLoadingMore] = useState(false)
  const [moreError, setMoreError] = useState('')

  if (!data) return error ? <LoadError error={error} onRetry={reload} retrying={refreshing} /> : <PageSkeleton cards={0} />

  // Pages loaded with "Load more" belong to the first page they extended.
  const extra = more.key === data ? more : { items: [], cursor: undefined }
  const items = [...data.items, ...extra.items]
  const cursor = extra.cursor === undefined ? data.nextCursor : extra.cursor

  const loadMore = async () => {
    setLoadingMore(true)
    setMoreError('')
    try {
      const page = await getAuditLogs(cursor)
      setMore({ key: data, items: [...extra.items, ...page.items], cursor: page.nextCursor })
    } catch (err) {
      setMoreError(errText(err, 'Could not load more entries.'))
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className={`ac-stack ${refreshing ? 'ac-dim' : ''}`} aria-busy={refreshing || undefined}>
      <p className="ac-muted">Append-only record of admin actions and denied admin requests. Newest first. Read-only.</p>
      <Card title="Audit log" headingLevel={2} flush>
        {items.length === 0 ? <NoData title="No audit entries yet" /> : (
          <div className="ac-table-wrap">
            <table className="ac-table">
              <thead>
                <tr><th scope="col">Time</th><th scope="col">Actor</th><th scope="col">Action</th><th scope="col">Resource</th><th scope="col">Result</th><th scope="col">IP</th><th scope="col">Request</th></tr>
              </thead>
              <tbody>
                {items.map((i) => (
                  <tr key={`${i.ts}-${i.requestId || ''}-${i.action}`}>
                    <td>{fmtTime(i.ts)}</td>
                    <td title={i.adminSub}><code>{short(i.adminSub)}</code></td>
                    <th scope="row">{i.action.replace(/_/g, ' ')}</th>
                    <td className="ac-wrap">{i.resource}</td>
                    <td><Badge tone={RESULT_TONE[i.result] || 'neutral'}>{i.result}</Badge>{i.reason && <span className="ac-reason">{i.reason.replace(/_/g, ' ')}</span>}</td>
                    <td>{i.ip || '—'}</td>
                    <td title={i.userAgent || ''}><code>{i.requestId ? i.requestId.slice(0, 10) : '—'}</code></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
      {moreError && <p className="ac-muted" role="alert">{moreError}</p>}
      {cursor && <Button variant="secondary" onClick={loadMore} loading={loadingMore} loadingText="Loading…">Load more</Button>}
    </div>
  )
}
