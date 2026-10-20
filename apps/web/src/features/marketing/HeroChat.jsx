// The home page's question box. Guests chat with SankatAI right here, with no
// account: the server stores nothing and this conversation lives only in this
// component's state. "Save this chat" hands it to sign-up, and the chat page
// imports it into the new account. Signed-in visitors go to their own chat.
import { useEffect, useId, useRef, useState } from 'react'
import { ArrowRight, RotateCcw, Save, Send, UserRound } from 'lucide-react'
import { Button } from '../../components/ui'
import { errText } from '../../utils/errText'
import { UserMessage, AssistantMessage, ErrorMessage, ThinkingRow } from '../chat/components/ChatMessages.jsx'
import { QUICK_TOPICS } from '../chat/quickTopics.jsx'
import { GUEST_MAX_TURNS, guestChat, newGuestId, replyToBubble, shortGuestId, toWire } from '../chat/guestChat'
import { shareReply } from '../chat/utils/share'

const announce = (m) => {
  if (!m) return ''
  if (m.sender === 'error') return 'Your message was not sent.'
  return `SankatAI replied. ${String(m.text || '').replace(/\*\*/g, '').slice(0, 160)}`
}

export default function HeroChat({ authed, onAskSignedIn, onSaveGuest }) {
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [guestId, setGuestId] = useState(newGuestId)
  const [messages, setMessages] = useState([])
  const [sending, setSending] = useState(false)
  const [retryingId, setRetryingId] = useState(null)
  const [limitReached, setLimitReached] = useState(false)
  const [lastReply, setLastReply] = useState(null)
  const inputRef = useRef(null)
  const logRef = useRef(null)
  const cardRef = useRef(null)
  const id = useId()
  const active = messages.length > 0

  // Keep the newest message in view inside the conversation box.
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [messages, sending])

  // `answers`: picked in a follow-up questionnaire; `q` is then their summary.
  const send = async (q, base = messages, answers = null) => {
    const userMsg = { id: `gu-${Date.now()}`, sender: 'user', text: q, createdAt: new Date().toISOString(), status: 'sent', ...(answers && { answers }) }
    const next = [...base, userMsg]
    setMessages(next)
    setSending(true)
    if (!active) requestAnimationFrame(() => cardRef.current?.scrollIntoView?.({ block: 'nearest' }))
    try {
      const reply = await guestChat(guestId, toWire(next))
      const bot = replyToBubble(reply, next.length)
      setMessages((prev) => [...prev.map((m) => (m.id === userMsg.id ? { ...m, status: 'received' } : m)), bot])
      setLastReply(bot)
    } catch (e) {
      if (e.status === 409) {
        // Guest limit: give the text back and offer to save instead.
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id))
        setText(q)
        setLimitReached(true)
        return
      }
      const row = { id: `ge-${Date.now()}`, sender: 'error', text: errText(e, 'The service is unavailable right now.'), retry: e.status === 400 ? null : { text: q, failedId: userMsg.id, answers }, createdAt: new Date().toISOString() }
      setMessages((prev) => [...prev.map((m) => (m.id === userMsg.id ? { ...m, status: 'failed' } : m)), row])
      setLastReply(row)
    } finally {
      setSending(false)
    }
  }

  const ask = (q) => {
    const value = q.trim()
    if (!value) {
      setError('Please describe your question first.')
      inputRef.current?.focus()
      return
    }
    if (authed) { onAskSignedIn(value); return }
    if (sending || limitReached) return
    setText('')
    setError('')
    void send(value) // send() reports its own failures in the conversation
  }
  const onSubmit = (e) => { e.preventDefault(); ask(text) }
  const onKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); ask(text) }
  }
  const retry = async (errId) => {
    const row = messages.find((m) => m.id === errId)
    if (!row?.retry || sending) return
    setRetryingId(errId)
    const base = messages.filter((m) => m.id !== errId && m.id !== row.retry.failedId)
    await send(row.retry.text, base, row.retry.answers)
    setRetryingId(null)
  }
  const dismiss = (errId) => setMessages((prev) => prev.filter((m) => m.id !== errId))
  const startOver = () => {
    setMessages([]); setGuestId(newGuestId()); setText(''); setLimitReached(false); setLastReply(null)
    requestAnimationFrame(() => inputRef.current?.focus())
  }

  const helpText = authed
    ? 'This opens a new chat in your account. You can review your question before sending it.'
    : 'Ask as a guest, no account needed. Nothing is saved unless you create an account.'

  return (
    <div className="lx-ask-wrap">
      <div ref={cardRef} className={`lx-ask ${active ? 'lx-ask--chat' : ''}`}>
        {active && (
          <header className="lx-chat-head">
            <span className="lx-chat-who">
              <span className="lx-chat-avatar" aria-hidden="true"><UserRound size={18} /></span>
              <span>
                <span className="lx-chat-title">Guest chat <span className="lx-chat-id">ID {shortGuestId(guestId)}</span></span>
                <span className="lx-chat-sub">Nothing is saved. Create an account to keep this chat.</span>
              </span>
            </span>
            <span className="lx-chat-actions">
              <Button size="sm" variant="primary" icon={Save} onClick={() => onSaveGuest(guestId, messages)} disabled={sending}>Save this chat</Button>
              <Button size="sm" variant="ghost" icon={RotateCcw} onClick={startOver}>New chat</Button>
            </span>
          </header>
        )}

        {active && (
          <div className="lx-chat-log" ref={logRef} aria-label="Guest conversation" role="region" tabIndex={0}>
            {messages.map((m) => {
              if (m.sender === 'user') return <UserMessage key={m.id} m={m} attachments={[]} onOpenAtt={() => {}} />
              if (m.sender === 'error') return <ErrorMessage key={m.id} m={m} retrying={retryingId === m.id} onRetry={() => retry(m.id)} onDismiss={() => dismiss(m.id)} />
              return <AssistantMessage key={m.id} m={m} guest onShare={shareReply} onFeedback={() => {}}
                interactive={m.id === messages.at(-1)?.id && !sending && !limitReached} onAnswer={(text, answers) => send(text, messages, answers)} />
            })}
            {sending && <ThinkingRow />}
          </div>
        )}
        <div className="sr-only" aria-live="polite" aria-atomic="true">{announce(lastReply)}</div>

        {limitReached ? (
          <div className="lx-chat-limit" role="status">
            <p>You have reached the limit for a guest chat ({GUEST_MAX_TURNS} messages). Save it to your account to keep going.</p>
            <Button variant="primary" icon={Save} onClick={() => onSaveGuest(guestId, messages)}>Save this chat</Button>
          </div>
        ) : (
          <form className={`lx-ask-form ${active ? 'lx-ask-form--chat' : ''}`} onSubmit={onSubmit} noValidate>
            <label htmlFor={`${id}-q`} className={active ? 'sr-only' : 'lx-ask-label'}>
              {active ? 'Reply to SankatAI' : 'What would you like help with today?'}
            </label>
            <textarea
              ref={inputRef}
              id={`${id}-q`}
              className="lx-ask-input"
              rows={active ? 1 : 3}
              value={text}
              maxLength={2000}
              placeholder={active ? 'Reply, or add more detail…' : 'Describe your symptoms, for example: fever and headache since yesterday'}
              aria-invalid={error ? true : undefined}
              aria-describedby={`${id}-help${error ? ` ${id}-err` : ''}`}
              onChange={(e) => { setText(e.target.value); if (error) setError('') }}
              onKeyDown={onKeyDown}
            />
            {error && <p id={`${id}-err`} className="lx-ask-error" role="alert">{error}</p>}
            <div className="lx-ask-foot">
              <p id={`${id}-help`} className={active ? 'sr-only' : 'lx-ask-help'}>
                {helpText}
                <span className="sr-only"> Press Enter to send, or Shift and Enter for a new line.</span>
              </p>
              {active ? (
                <Button type="submit" variant="primary" size="sm" icon={Send} className="lx-ask-send" loading={sending} loadingText="Send" aria-label="Send message">Send</Button>
              ) : (
                <Button type="submit" variant="primary" iconEnd={ArrowRight} className="lx-ask-send">Ask SankatAI</Button>
              )}
            </div>
          </form>
        )}
      </div>

      {!active && (
        <div className="lx-starters">
          <p className="lx-starters-label" id={`${id}-topics`}>Quick help for</p>
          <ul role="list" className="lx-starters-list" aria-labelledby={`${id}-topics`}>
            {QUICK_TOPICS.map((t) => (
              <li key={t.key}>
                <button type="button" className="lx-starter" onClick={() => ask(t.prompt)}>
                  <span className="lx-starter-icon"><t.Icon size={20} aria-hidden="true" /></span>
                  <span>{t.label}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
