import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ArrowRight, ClipboardList, HeartPulse, MapPin } from 'lucide-react'
import { sevMeta, CHAT_SUGGESTIONS } from '@sankatai/shared'
import { Alert, Button, Chip, severityUi, useReducedMotion, useToast } from '../../../components/ui'
import { errText } from '../../../utils/errText'
import { parseAnalysis } from '../../chat/utils/format.jsx'
import { CHAT_CSS } from '../../chat/chat.styles'
import { UserMessage, AssistantMessage, ErrorMessage, ThinkingRow } from '../../chat/components/ChatMessages.jsx'
import Composer from '../../chat/components/Composer.jsx'
import AnalysisDrawer from '../../chat/components/AnalysisDrawer.jsx'
import { ttsPlayer } from '../../chat/tts/ttsPlayer'
import { takePendingQuestion } from '../../chat/pendingQuestion'
import { saveGuestChat, takeStashedGuestChat } from '../../chat/guestChat'
import { QUICK_TOPICS } from '../../chat/quickTopics.jsx'
import { shareReply } from '../../chat/utils/share'

// Short spoken summary for the live region when a reply arrives.
const announceFor = (m) => {
  if (m.sender === 'error') return 'Your message was not sent.'
  if (m.offline) return `Offline estimate, not an AI assessment. ${m.severity ? sevMeta(m.severity).title : ''}`
  const sev = m.severity ? `${severityUi(m.severity)?.label}${m.riskScore != null ? `, risk ${m.riskScore} out of 100` : ''}. ` : ''
  return `SankatAI replied. ${sev}${String(m.text || '').replace(/\*\*/g, '').slice(0, 160)}`
}

export default function ChatPage() {
  const d = useOutletContext()
  const { messages, isLoading, chatAttachmentMap } = d
  const reduced = useReducedMotion()
  const scrollRef = useRef(null)
  const toast = useToast()
  const [retryingId, setRetryingId] = useState(null)

  // Leaving the chat (or switching conversation) stops any reply being read.
  useEffect(() => () => ttsPlayer.stop(), [d.activeId])

  // A question typed on the home page opens as a new, unsent chat for review.
  useEffect(() => {
    const q = takePendingQuestion()
    if (!q) return
    d.startDraft(q)
    requestAnimationFrame(() => document.getElementById('composer-input')?.focus())
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // A guest conversation the person chose to save before signing up: import it
  // once (the server checks every AI reply's signature), then open it.
  useEffect(() => {
    const stashed = takeStashedGuestChat()
    if (!stashed) return
    ;(async () => {
      try {
        const c = await saveGuestChat(stashed.guestId, stashed.messages)
        await d.loadConsultations()
        await d.selectConsultation(c.consultationId)
        toast.success('Your guest conversation is now saved to your account.')
      } catch (e) {
        toast.error(errText(e, 'We couldn’t save your guest conversation.'))
      }
    })()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Keep the newest message in view.
  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTo({ top: el.scrollHeight, behavior: reduced ? 'auto' : 'smooth' })
  }, [messages, isLoading, reduced])

  const latestAnalysis = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i]
      if (m.sender === 'bot' && m.raw) {
        const p = parseAnalysis(m.raw)
        if (p && (p.severity || p.followUpQuestions?.length)) return p
      }
    }
    return null
  }, [messages])

  // Optimistic messages carry `attachments` (local previews); history messages
  // carry `attachmentIds`, resolved via the chat's attachment map.
  const msgAttachments = (m) => {
    if (m.attachments?.length) return m.attachments
    if (m.attachmentIds?.length) {
      return m.attachmentIds
        .map((id) => { const a = chatAttachmentMap?.[id]; return a ? { attachmentId: id, kind: a.kind, name: a.filename, url: a.downloadUrl } : null })
        .filter(Boolean)
    }
    return []
  }
  const openAtt = (att) => { if (att.url) window.open(att.url, '_blank', 'noopener') }
  const shareMessage = shareReply
  const retry = async (id) => { setRetryingId(id); await d.retrySend(id); setRetryingId(null) }
  const [reloading, setReloading] = useState(false)
  const reloadChats = async () => { setReloading(true); await d.reloadChats(); setReloading(false) }

  const showEmpty = messages.length === 0 && !isLoading

  return (
    <div className="chat">
      <style>{CHAT_CSS}</style>
      <div className="chat-scroll" ref={scrollRef}>
        <section className="chat-thread" aria-label="Conversation">
          {d.consultationsError && !d.activeId && (
            <Alert tone="danger" title="Couldn't load your chats." action={<Button size="sm" variant="secondary" loading={reloading} loadingText="Retrying…" onClick={reloadChats}>Try again</Button>}>
              You can still describe new symptoms below. If this is an emergency, call 108.
            </Alert>
          )}
          {showEmpty ? (
            <div className="chat-empty">
              <span className="chat-empty-mark" aria-hidden="true"><HeartPulse size={24} /></span>
              <p className="chat-empty-hello">Hello, {d.firstName}.</p>
              <h2>What would you like help with today?</h2>
              <p className="chat-empty-lead">
                Describe your symptoms in your own words. I'll ask a few questions and tell you how urgent it may be.
                This is guidance, not a diagnosis. If someone is in danger, <a className="link link--emergency" href="tel:108">call 108 now</a>.
              </p>
              <p className="chat-empty-label" id="chat-examples-label">Quick help for</p>
              <ul role="list" className="chat-examples" aria-labelledby="chat-examples-label">
                {QUICK_TOPICS.map((t) => (
                  <li key={t.key}>
                    <button type="button" className="chat-example" disabled={isLoading} onClick={() => d.sendQuick(t.prompt)}>
                      <span className="chat-example-icon" aria-hidden="true"><t.Icon size={18} /></span>
                      <span className="chat-example-text">{t.label}</span><ArrowRight size={18} aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
              <div className="chat-chips">
                {CHAT_SUGGESTIONS.map((c) => (
                  <Chip
                    key={c.key}
                    icon={c.action === 'hospital' ? MapPin : ClipboardList}
                    onClick={() => (c.action === 'hospital' ? d.handleFindHospitals() : d.setInput(c.prompt))}
                  >
                    {c.label}
                  </Chip>
                ))}
              </div>
            </div>
          ) : (
            <AnimatePresence initial={false} key={d.activeId || 'new'}>
            {messages.map((m) => {
              if (m.sender === 'user') return <UserMessage key={m.id} m={m} attachments={msgAttachments(m)} onOpenAtt={openAtt} onUnsend={d.unsendMessageById} />
              if (m.sender === 'error') return <ErrorMessage key={m.id} m={m} retrying={retryingId === m.id} onRetry={() => retry(m.id)} onDismiss={() => d.dismissError(m.id)} />
              return <AssistantMessage key={m.id} m={m} onFeedback={d.submitFeedback} onShare={shareMessage} consultationId={d.activeId} />
            })}
            </AnimatePresence>
          )}
          {isLoading && <ThinkingRow />}
        </section>
      </div>

      {/* Announces each new reply (not history loads) to screen readers. */}
      <div className="sr-only" aria-live="polite" aria-atomic="true">{d.lastReply ? announceFor(d.lastReply) : ''}</div>

      <Composer
        input={d.input}
        setInput={d.setInput}
        onSubmit={d.handleSend}
        isLoading={isLoading}
        voice={d.voice}
        attachments={d.attachments}
        onRemoveAttachment={d.removeAttachment}
        docInputRef={d.docInputRef}
        photoInputRef={d.photoInputRef}
      />

      <AnalysisDrawer
        open={d.analysisOpen}
        onClose={() => d.setAnalysisOpen(false)}
        analysis={latestAnalysis}
        primaryContact={d.primaryContact}
        onShareLocation={d.handleSendLocationAlert}
        onFindHospitals={d.handleFindHospitals}
      />
    </div>
  )
}
