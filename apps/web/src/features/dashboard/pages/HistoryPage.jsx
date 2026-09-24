// Chat history: past consultations grouped by day. Opening one switches to
// Chat. Row actions (rename, delete) are real buttons beside the row — not
// nested inside it — and delete asks for confirmation.

import { useMemo, useState } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { AnimatePresence, motion } from 'framer-motion'
import { Search, X, History as HistoryIcon, Pencil, Trash2, Plus, MessageSquare } from 'lucide-react'
import { relTime, groupConsults } from '../../chat/utils/format.jsx'
import {
  Button, ConfirmDialog, EmptyState, ErrorState, IconButton, IconInput, PageHeader, SeverityDot, Spinner,
  severityUi, useDelayedFlag, listContainer, listItem,
} from '../../../components/ui'

const CSS = `
.hist-search { max-width: 100%; }
.hist-groups { display: flex; flex-direction: column; gap: var(--space-6); }
.hist-group { display: flex; flex-direction: column; gap: var(--space-2); }
.hist-list { list-style: none; margin: 0; padding: 0; background: var(--surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); overflow: hidden; }
.hist-row { display: flex; align-items: center; gap: var(--space-1); padding-right: var(--space-2); }
.hist-row + .hist-row { border-top: 1px solid var(--border-subtle); }
.hist-row[aria-current="true"] { background: var(--surface-hover); }
.hist-open {
  flex: 1; min-width: 0; display: flex; align-items: center; gap: var(--space-3); min-height: 3.5rem; padding: var(--space-3) var(--space-4);
  border: 0; background: transparent; text-align: left; color: var(--text-primary);
}
.hist-open:hover { background: var(--surface-hover); }
.hist-open:focus-visible { outline-offset: -2px; }
.hist-ic { display: grid; place-items: center; width: 1.25rem; color: var(--text-muted); flex-shrink: 0; }
.hist-main { display: flex; flex-direction: column; min-width: 0; }
.hist-title { font-size: var(--fs-md); line-height: var(--lh-md); font-weight: var(--fw-medium); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.hist-meta { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.hist-actions { display: flex; gap: var(--space-1); flex-shrink: 0; }
@media (hover: hover) and (pointer: fine) {
  .hist-actions { opacity: 0; transition: opacity var(--dur-fast) var(--ease-standard); }
  .hist-row:hover .hist-actions, .hist-row:focus-within .hist-actions { opacity: 1; }
}
`

export default function HistoryPage() {
  const navigate = useNavigate()
  const d = useOutletContext()
  const { visibleConsultations: list, search, setSearch, searching, activeId, consultationsError } = d
  const grouped = useMemo(() => groupConsults(list), [list])
  const showSearching = useDelayedFlag(searching)
  const [toDelete, setToDelete] = useState(null)
  const [deleting, setDeleting] = useState(false)
  const [retrying, setRetrying] = useState(false)

  const open = (id) => { d.selectConsultation(id); navigate('/dashboard/chat') }
  const startNew = async () => { const c = await d.startNewConsultation(); if (c) navigate('/dashboard/chat') }
  const confirmDelete = async () => {
    setDeleting(true)
    const ok = await d.deleteChat(toDelete.consultationId)
    setDeleting(false)
    if (ok) setToDelete(null)
  }
  const retry = async () => { setRetrying(true); await d.loadConsultations(); setRetrying(false) }
  const q = search.trim()

  return (
    <div className="pg">
      <style>{CSS}</style>
      <PageHeader
        description="Open a past consultation to continue where you left off. Search looks inside messages too."
        actions={<Button variant="primary" icon={Plus} onClick={startNew}>New chat</Button>}
      />

      <div className="hist-search" role="search">
        <label htmlFor="hist-q" className="sr-only">Search chats</label>
        <IconInput
          id="hist-q"
          icon={Search}
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search chats"
          end={showSearching ? <span className="ui-iconbtn" aria-hidden="true"><Spinner /></span>
            : search ? <IconButton label="Clear search" icon={X} size={16} tooltip={false} onClick={() => setSearch('')} /> : null}
        />
        <p className="sr-only" role="status">{showSearching ? 'Searching…' : q ? `${list.length} result${list.length === 1 ? '' : 's'}` : ''}</p>
      </div>

      {consultationsError && !q ? (
        <ErrorState title="Couldn't load your chats" description={`${consultationsError} Your conversations are safe — try again.`} onRetry={retry} retrying={retrying} />
      ) : list.length === 0 && !searching ? (
        q ? (
          <EmptyState icon={Search} title={`No chats match “${q}”`} description="Try a different word, such as a symptom or body part." action={<Button variant="secondary" onClick={() => setSearch('')}>Clear search</Button>} />
        ) : (
          <EmptyState icon={HistoryIcon} title="No consultations yet" description="When you describe symptoms to SankatAI, the conversation is saved here so you can come back to it." action={<Button variant="primary" icon={Plus} onClick={startNew}>Start a chat</Button>} />
        )
      ) : (
        <div className="hist-groups">
          {grouped.map(([label, items]) => (
            <section key={label} className="hist-group" aria-labelledby={`hg-${label}`}>
              <h2 id={`hg-${label}`} className="ui-overline">{label}</h2>
              <motion.ul role="list" className="hist-list" {...listContainer}>
                <AnimatePresence initial={false}>
                {items.map((c) => {
                  const sev = severityUi(c.lastSeverity)
                  return (
                    <motion.li key={c.consultationId} className="hist-row" aria-current={activeId === c.consultationId ? 'true' : undefined} {...listItem}>
                      <button type="button" className="hist-open" onClick={() => open(c.consultationId)}>
                        <span className="hist-ic">{sev ? <SeverityDot severity={c.lastSeverity} /> : <MessageSquare size={16} aria-hidden="true" />}</span>
                        <span className="hist-main">
                          <span className="hist-title">{c.title || 'New consultation'}</span>
                          <span className="hist-meta">{relTime(c.updatedAt)}{sev ? ` · ${sev.label}` : ''}</span>
                        </span>
                      </button>
                      <span className="hist-actions">
                        <IconButton label={`Rename “${c.title || 'New consultation'}”`} icon={Pencil} size={16} tooltip={false} onClick={() => d.openRename(c)} />
                        <IconButton label={`Delete “${c.title || 'New consultation'}”`} icon={Trash2} size={16} variant="danger" tooltip={false} onClick={() => setToDelete(c)} />
                      </span>
                    </motion.li>
                  )
                })}
                </AnimatePresence>
              </motion.ul>
            </section>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(toDelete)}
        onClose={() => !deleting && setToDelete(null)}
        onConfirm={confirmDelete}
        busy={deleting}
        icon={Trash2}
        title="Delete this chat?"
        description={toDelete ? `“${toDelete.title || 'New consultation'}” and its messages will be removed from your history. This can't be undone.` : ''}
        confirmLabel="Delete chat"
      />
    </div>
  )
}
