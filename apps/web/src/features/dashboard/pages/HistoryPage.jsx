// Chat history, moved out of the chat column into its own tab.
// Lists past consultations grouped by day; opening one switches to the Chat tab.
// Rename/delete reuse the handlers already provided by DashboardLayout.

import { useMemo } from 'react'
import { useNavigate, useOutletContext } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Search, X, History as HistoryIcon, Pencil, Trash2, MessageSquare, Plus } from 'lucide-react'
import { relTime, groupConsults, SEV } from '../../chat/utils/format.jsx'

export default function HistoryPage() {
  const navigate = useNavigate()
  const {
    consultations, visibleConsultations, searching, activeId, search, setSearch,
    selectConsultation, startNewConsultation, handleDelete, openRename,
  } = useOutletContext()

  // `visibleConsultations` is already server-filtered (title OR message text).
  const list = visibleConsultations ?? consultations
  const grouped = useMemo(() => groupConsults(list), [list])

  const open = (id) => { selectConsultation(id); navigate('/dashboard/chat') }
  const startNew = async () => { await startNewConsultation(); navigate('/dashboard/chat') }

  return (
    <div className="db-view scroll-view">
      <div className="dh-wrap">
        <div className="dh-head">
          <div>
            <h3>Chat history</h3>
            <p>Open a past consultation to continue where you left off.</p>
          </div>
          <button type="button" className="dx-action" onClick={startNew}><Plus size={15} /> New chat</button>
        </div>

        <div className="dh-search">
          <Search size={15} />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search chats" />
          {!!search && <button type="button" className="db-icon-ghost" onClick={() => setSearch('')} aria-label="Clear search"><X size={14} /></button>}
        </div>

        {searching && <div className="dh-empty"><Search size={28} /><p>Searching…</p></div>}
        {!searching && list.length === 0 && (
          <div className="dh-empty">
            {search.trim() ? <Search size={28} /> : <HistoryIcon size={28} />}
            <p>{search.trim() ? 'No chats found.' : 'No consultations yet.'}</p>
          </div>
        )}

        {grouped.map(([label, items]) => (
          <div key={label} className="dh-group">
            <div className="dh-group-title">{label}</div>
            {items.map((c) => (
              <motion.div
                key={c.consultationId}
                className={`dh-item ${activeId === c.consultationId ? 'active' : ''}`}
                onClick={() => open(c.consultationId)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter') open(c.consultationId) }}
                whileHover={{ x: 2 }}
                transition={{ type: 'spring', stiffness: 400, damping: 30 }}
              >
                <span className="dh-item-ic">
                  {c.lastSeverity && SEV[c.lastSeverity]
                    ? <span className={`dh-dot sev-${SEV[c.lastSeverity].cls}`} />
                    : <MessageSquare size={15} />}
                </span>
                <span className="dh-item-main">
                  <span className="dh-item-title">{c.title || 'New consultation'}</span>
                  <span className="dh-item-time">{relTime(c.updatedAt)}</span>
                </span>
                <span className="dh-item-actions">
                  <span className="dx-history-act" role="button" title="Rename chat" onClick={(e) => openRename(c, e)}><Pencil size={14} /></span>
                  <span className="dx-history-act danger" role="button" title="Delete chat" onClick={(e) => handleDelete(c.consultationId, e)}><Trash2 size={14} /></span>
                </span>
              </motion.div>
            ))}
          </div>
        ))}
      </div>
    </div>
  )
}
