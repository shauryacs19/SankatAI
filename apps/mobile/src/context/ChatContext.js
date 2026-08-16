// Shared chat/consultation state so the drawer (history list, search, new chat)
// and the ChatScreen (messages for the active chat) stay in sync.
//
// `selectionSeq` bumps only on an explicit select / new-chat, so ChatScreen can
// reload messages on selection changes without clobbering optimistic sends
// (which set activeId directly via registerCreated, without bumping the seq).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { listConsultations, renameConsultation, deleteConsultation } from '../lib/api'
import { filterConsultations } from '../lib/chat'

const ChatContext = createContext(null)

export function ChatProvider({ children }) {
  const [consultations, setConsultations] = useState([])
  const [activeId, setActiveId] = useState(null)
  const [search, setSearch] = useState('')
  const [selectionSeq, setSelectionSeq] = useState(0)
  const [searchResults, setSearchResults] = useState(null) // null = not searching
  const [searching, setSearching] = useState(false)
  const started = useRef(false)
  const bump = () => setSelectionSeq((s) => s + 1)

  const loadList = useCallback(async (opts = {}) => {
    try { const l = await listConsultations(opts); setConsultations(l); return l } catch { return [] }
  }, [])

  // On first mount, load the list and open the most recent chat.
  // This runs in the fragile window right after sign-in flips to AUTHENTICATED,
  // before the backend's JWKS cache is warm. Use signOutOn401:false (like the
  // login route-probe) so a transient/cold-start 401 on this initial read can't
  // tear down the just-created session and bounce the user back to Login.
  useEffect(() => {
    if (started.current) return
    started.current = true
    ;(async () => {
      const l = await loadList({ signOutOn401: false })
      if (l.length) { setActiveId(l[0].consultationId); bump() }
    })()
  }, [loadList])

  const select = useCallback((id) => { setActiveId(id); bump() }, [])
  const startNew = useCallback(() => { setActiveId(null); bump() }, [])

  // ChatScreen created a consultation via send()/attach — reflect it without a reload.
  const registerCreated = useCallback((c) => { setConsultations((p) => [c, ...p]); setActiveId(c.consultationId) }, [])

  const renameChat = useCallback(async (id, title) => {
    const updated = await renameConsultation(id, title)
    const t = updated?.title || title
    setConsultations((p) => p.map((c) => (c.consultationId === id ? { ...c, title: t } : c)))
    return t
  }, [])

  const deleteChat = useCallback(async (id) => {
    await deleteConsultation(id)
    setConsultations((p) => p.filter((c) => c.consultationId !== id))
    setActiveId((cur) => cur === id ? null : cur)
    setSelectionSeq((s) => s + 1) // reload messages if the active chat was removed
  }, [])

  // Search runs SERVER-side so it also matches text inside the messages, not
  // just chat titles. Debounced; the local title filter is the instant fallback
  // while the request is in flight.
  useEffect(() => {
    const q = search.trim()
    if (!q) { setSearchResults(null); setSearching(false); return undefined }
    setSearching(true)
    const t = setTimeout(async () => {
      try { setSearchResults(await listConsultations({}, q)) }
      catch { setSearchResults(filterConsultations(consultations, q)) }
      finally { setSearching(false) }
    }, 250)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search])

  const filtered = useMemo(() => {
    if (!search.trim()) return consultations
    return searchResults ?? filterConsultations(consultations, search)
  }, [consultations, search, searchResults])

  const value = useMemo(() => ({
    consultations, filtered, activeId, search, setSearch, searching, selectionSeq,
    select, startNew, loadList, registerCreated, renameChat, deleteChat,
  }), [consultations, filtered, activeId, search, searching, selectionSeq, select, startNew, loadList, registerCreated, renameChat, deleteChat])

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
