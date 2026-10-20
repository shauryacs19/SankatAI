// Guest chat (home page, no account). The server stores nothing: this module
// holds the conversation's wire format and, only when the person asks to save
// it, hands it to the chat page through sessionStorage (this tab only), where
// it is imported into their new account once and then removed.
import { uuidV4 } from '@sankatai/shared'
import { request } from '../../services/api/httpClient'
import { toBubble } from './utils/format.jsx'

const SAVE_KEY = 'sankatai:guest-chat'
export const GUEST_MAX_TURNS = 10 // matches the backend's GUEST_MAX_TURNS default

export const newGuestId = () => (globalThis.crypto?.randomUUID
  ? globalThis.crypto.randomUUID()
  : uuidV4((a) => globalThis.crypto.getRandomValues(a)))
// A short, readable form of the guest id for the chat header.
export const shortGuestId = (id) => String(id).replace(/-/g, '').slice(0, 8).toUpperCase().replace(/^(.{4})/, '$1-')

// Bubbles -> what the server expects. Errors and unsent messages are left out;
// assistant turns keep the signature the server gave them.
export const toWire = (bubbles) => bubbles.flatMap((m) => {
  if (m.sender === 'user' && m.status !== 'failed') return [{ role: 'user', content: m.text, createdAt: m.createdAt, ...(m.answers && { answers: m.answers }) }]
  if (m.sender === 'bot' && m.signature) {
    return [{ role: 'assistant', content: m.raw, createdAt: m.createdAt, lang: m.lang, isOfflineFallback: Boolean(m.offline), signature: m.signature }]
  }
  return []
})

export const replyToBubble = (reply, i) => ({
  ...toBubble({ id: `guest-${i}`, role: 'assistant', content: reply.content, createdAt: reply.createdAt, lang: reply.lang, isOfflineFallback: reply.isOfflineFallback }),
  signature: reply.signature,
})

// Plain fetch with no token: a guest error can never touch a signed-in session.
export const guestChat = async (guestId, messages) => {
  const res = await fetch('/api/guest/chat', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ guestId, messages }),
  })
  if (!res.ok) {
    let detail = `Request failed (${res.status})`
    try { const data = await res.json(); if (typeof data.detail === 'string') detail = data.detail } catch { /* non-JSON fault */ }
    throw Object.assign(new Error(detail), { status: res.status })
  }
  return (await res.json()).reply
}

export const saveGuestChat = (guestId, messages) => request('/guest/save', { method: 'POST', body: { guestId, messages } })

export const stashGuestChat = (guestId, bubbles) => {
  try { sessionStorage.setItem(SAVE_KEY, JSON.stringify({ guestId, messages: toWire(bubbles) })) } catch { /* storage blocked */ }
}
export const hasStashedGuestChat = () => {
  try { return Boolean(sessionStorage.getItem(SAVE_KEY)) } catch { return false }
}
export const takeStashedGuestChat = () => {
  try {
    const raw = sessionStorage.getItem(SAVE_KEY)
    sessionStorage.removeItem(SAVE_KEY)
    const data = raw ? JSON.parse(raw) : null
    return data?.guestId && Array.isArray(data.messages) && data.messages.length ? data : null
  } catch { return null }
}
