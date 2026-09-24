import { useEffect, useMemo, useRef, useState } from 'react'
import { useOutletContext } from 'react-router-dom'
import { AnimatePresence } from 'framer-motion'
import { ArrowRight, ClipboardList, MapPin } from 'lucide-react'
import { sevMeta, CHAT_SUGGESTIONS } from '@sankatai/shared'
import { Alert, Button, Chip, severityUi, useReducedMotion } from '../../../components/ui'
import { parseAnalysis } from '../../chat/utils/format.jsx'
import { CHAT_CSS } from '../../chat/chat.styles'
import { UserMessage, AssistantMessage, ErrorMessage, ThinkingRow } from '../../chat/components/ChatMessages.jsx'
import Composer from '../../chat/components/Composer.jsx'
import AnalysisDrawer from '../../chat/components/AnalysisDrawer.jsx'

const EXAMPLES = ['I have chest pain and shortness of breath', 'High fever and headache for 2 days', "A deep cut that won't stop bleeding"]

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
  const [retryingId, setRetryingId] = useState(null)

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
  const shareMessage = async (m) => {
    const text = [m.severity ? sevMeta(m.severity).title : 'SankatAI', String(m.text || '').replace(/\*\*/g, '')].filter(Boolean).join('\n\n')
    try {
      if (navigator.share) await navigator.share({ text })
      else await navigator.clipboard.writeText(text)
    } catch { /* cancelled */ }
  }
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
              <h2>Hi {d.firstName}. What symptoms are you having?</h2>
              <p className="chat-empty-lead">
                Describe what you feel in your own words. I'll ask follow-up questions and tell you how urgent it is.
                This is guidance, not a diagnosis. If someone is in danger, <a href="tel:108">call 108 now</a>.
              </p>
              <p className="ui-overline" id="chat-examples-label">Try describing</p>
              <ul role="list" className="chat-examples" aria-labelledby="chat-examples-label">
                {EXAMPLES.map((s) => (
                  <li key={s}>
                    <button type="button" className="chat-example" onClick={() => { d.setInput(s); document.getElementById('composer-input')?.focus() }}>
                      <ArrowRight size={16} aria-hidden="true" />{s}
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
              return <AssistantMessage key={m.id} m={m} onFeedback={d.submitFeedback} onShare={shareMessage} />
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
