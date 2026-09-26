// Message rows. Three visibly different kinds, so nothing can pass for
// something it isn't: the user's own message, an AI assessment (or, visibly
// different, an OFFLINE keyword estimate), and a failed-send error row.

// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { motion } from 'framer-motion'
import { useRef, useState } from 'react'
import {
  HeartPulse, CloudOff, FileText, ShieldCheck, ThumbsUp, ThumbsDown, Share2, MoreVertical, Trash2,
  CheckCheck, AlertTriangle, Ambulance, RotateCw, Languages,
} from 'lucide-react'
import SpeakerButton from '../tts/SpeakerButton.jsx'
import {
  AI_DISCLAIMER, EMERGENCY_CALLOUT, TRANSLATION_LABELS, TRANSLATION_NAMES, nextTranslation, replyLanguageOf,
} from '@sankatai/shared'
import { Alert, Button, IconButton, Menu, SeverityBadge, severityUi, messageEnter, useToast } from '../../../components/ui'
import { errText } from '../../../utils/errText'
import { translateMessage } from '../services/chatApi'
import { formatBold, fmtTime, normalizeAssistant } from '../utils/format.jsx'

export function UserMessage({ m, attachments, onOpenAtt, onUnsend }) {
  const canUnsend = m.status !== 'sent' && m.status !== 'failed' && !String(m.id).startsWith('tmp-')
  return (
    <motion.div className="msg-user" {...messageEnter}>
      {attachments.length > 0 && (
        <div className="msg-atts">
          {attachments.map((att) => (att.kind === 'photo' && att.url ? (
            <button key={att.attachmentId} type="button" className="msg-att-img" onClick={() => onOpenAtt(att)} aria-label={`Open image ${att.name}`}>
              <img src={att.url} alt="" />
            </button>
          ) : (
            <button key={att.attachmentId} type="button" className="msg-att-doc" onClick={() => onOpenAtt(att)} aria-label={`Open ${att.name}`}>
              <FileText size={16} aria-hidden="true" /><span>{att.name}</span>
            </button>
          )))}
        </div>
      )}
      <div className="msg-user-row">
        {canUnsend && (
          <span className="msg-options">
            <Menu label="Message options" icon={MoreVertical} align="end" items={[{ key: 'unsend', label: 'Unsend', icon: Trash2, tone: 'danger', onSelect: () => onUnsend(m.id) }]} />
          </span>
        )}
        {m.text && <div className="msg-bubble">{formatBold(m.text)}</div>}
      </div>
      <MessageMeta m={m} />
    </motion.div>
  )
}

function MessageMeta({ m }) {
  if (m.status === 'failed') return <span className="msg-meta msg-meta--failed"><AlertTriangle size={12} aria-hidden="true" />Not sent</span>
  return (
    <span className="msg-meta">
      <time dateTime={m.createdAt}>{fmtTime(m.createdAt)}</time>
      {m.status === 'sent'
        ? <span role="status">· Sending…</span>
        : <CheckCheck size={14} aria-label="Delivered" />}
    </span>
  )
}

// Each click shows the reply in the next language of the cycle
// English -> Hindi -> Hinglish -> English, starting from the reply's own.
// Translations are fetched once (and cached server-side); severity never changes.
function useTranslationCycle(m, consultationId) {
  const toast = useToast()
  const original = replyLanguageOf(m.lang, m.raw)
  const [shown, setShown] = useState(original)
  const [busy, setBusy] = useState(false)
  const texts = useRef({ [original]: m.text })
  const next = nextTranslation(shown)
  const advance = async () => {
    if (busy) return
    if (texts.current[next] === undefined) {
      setBusy(true)
      try {
        const res = await translateMessage(consultationId, m.id, next)
        texts.current[next] = normalizeAssistant(res.content).text
      } catch (e) {
        toast.error(errText(e, 'Couldn’t translate this reply. Try again.'))
        return
      } finally {
        setBusy(false)
      }
    }
    setShown(next)
  }
  const translated = shown !== original
  return { text: translated ? texts.current[shown] : m.text, shown, next, busy, advance, translated }
}

export function AssistantMessage({ m, onFeedback, onShare, consultationId }) {
  const tr = useTranslationCycle(m, consultationId)
  const sev = m.severity ? severityUi(m.severity) : null
  const offline = Boolean(m.offline)
  const cls = ['msg-ai', sev && !offline ? `msg-ai--sev msg-ai--${sev.cls}` : '', offline ? 'msg-ai--offline' : ''].join(' ')
  const canFeedback = m.id && !String(m.id).startsWith('tmp-')
  // An EMERGENCY card carries the Call 108 action, so it never animates in.
  const enter = m.severity === 'EMERGENCY' ? {} : messageEnter
  return (
    <motion.article className={cls} aria-label={offline ? 'Offline estimate — not an AI assessment' : 'SankatAI assessment'} {...enter}>
      <header className="msg-ai-head">
        <span className="msg-ai-who">
          <span className="msg-ai-mark">{offline ? <CloudOff size={16} aria-hidden="true" /> : <HeartPulse size={16} aria-hidden="true" />}</span>
          <span className="msg-ai-name">{offline ? 'Offline estimate' : 'SankatAI'}</span>
          <time className="msg-ai-time" dateTime={m.createdAt}>{fmtTime(m.createdAt)}</time>
        </span>
        {sev && <SeverityBadge severity={m.severity} score={m.riskScore} size="lg" />}
      </header>

      {offline && (
        <Alert tone="warning" title="Offline mode — this is not an AI assessment.">
          The AI assistant is unavailable, so this is an automatic keyword estimate. If this could be an emergency, <a href="tel:108"><strong>call 108</strong></a>.
        </Alert>
      )}

      {tr.text && <p className="msg-ai-body" lang={tr.shown === 'hi' ? 'hi' : 'en'}>{formatBold(tr.text)}</p>}
      {tr.translated && <p className="msg-ai-translated">Translated to {TRANSLATION_NAMES[tr.shown]}</p>}

      {m.severity === 'EMERGENCY' && (
        <div className="msg-ai-call">
          <p>{EMERGENCY_CALLOUT}</p>
          <Button variant="emergency" icon={Ambulance} href="tel:108">Call 108 now</Button>
        </div>
      )}

      {Array.isArray(m.recommendations) && m.recommendations.length > 0 && (
        <div className="an-section">
          <h3>Recommendations</h3>
          <ul className="ui-list">{m.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {m.followUp && <p className="msg-ai-body">{m.followUp}</p>}

      {m.severity && (
        <p className="msg-ai-disclaimer"><ShieldCheck size={14} aria-hidden="true" /><span>{AI_DISCLAIMER}</span></p>
      )}

      {canFeedback && (
        <footer className="msg-ai-foot">
          <span className="msg-ai-foot-label" id={`fb-${m.id}`}>Was this helpful?</span>
          <div role="group" aria-labelledby={`fb-${m.id}`} className="msg-ai-fb">
            <Button size="sm" variant="ghost" icon={ThumbsUp} aria-pressed={m.feedback === 'like'} onClick={() => onFeedback(m.id, 'like')}>Yes</Button>
            <Button size="sm" variant="ghost" icon={ThumbsDown} aria-pressed={m.feedback === 'dislike'} onClick={() => onFeedback(m.id, 'dislike')}>No</Button>
          </div>
          <Button size="sm" variant="ghost" icon={Languages} className="msg-ai-translate" onClick={tr.advance}
            loading={tr.busy} loadingText="Translating…" aria-label={`Show this reply in ${TRANSLATION_NAMES[tr.next]}`}
            hint={`Show this reply in ${TRANSLATION_NAMES[tr.next]}`}>
            {TRANSLATION_LABELS[tr.next]}
          </Button>
          <SpeakerButton consultationId={consultationId} messageId={m.id} variant={tr.translated ? tr.shown : undefined} />
          <IconButton className="msg-ai-share" label="Share this response" icon={Share2} size={16} onClick={() => onShare(m)} tooltipAlign="end" />
        </footer>
      )}
    </motion.article>
  )
}

export function ErrorMessage({ m, onRetry, onDismiss, retrying }) {
  return (
    <motion.div className="msg-error" role="alert" {...messageEnter}>
      <AlertTriangle size={18} aria-hidden="true" />
      <div className="msg-error-body">
        <p className="msg-error-title">Your message wasn't sent.</p>
        <p className="msg-error-desc">{m.text} Check your connection and try again. If this is an emergency, <a href="tel:108"><strong>call 108</strong></a>.</p>
        <div className="msg-error-actions">
          {m.retry && <Button size="sm" variant="secondary" icon={RotateCw} onClick={onRetry} loading={retrying} loadingText="Sending…">Try again</Button>}
          <Button size="sm" variant="ghost" onClick={onDismiss}>Dismiss</Button>
        </div>
      </div>
    </motion.div>
  )
}

export function ThinkingRow() {
  return (
    <div className="msg-thinking" role="status">
      <span className="msg-ai-mark"><HeartPulse size={16} aria-hidden="true" /></span>
      <span className="msg-dots" aria-hidden="true"><span /><span /><span /></span>
      Analysing your symptoms…
    </div>
  )
}
