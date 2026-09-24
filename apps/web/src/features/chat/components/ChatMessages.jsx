// Message rows. Three visibly different kinds, so nothing can pass for
// something it isn't: the user's own message, an AI assessment (or, visibly
// different, an OFFLINE keyword estimate), and a failed-send error row.

// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { motion } from 'framer-motion'
import {
  HeartPulse, CloudOff, FileText, ShieldCheck, ThumbsUp, ThumbsDown, Share2, MoreVertical, Trash2,
  CheckCheck, AlertTriangle, Ambulance, RotateCw,
} from 'lucide-react'
import { AI_DISCLAIMER, EMERGENCY_CALLOUT } from '@sankatai/shared'
import { Alert, Button, IconButton, Menu, SeverityBadge, severityUi, messageEnter } from '../../../components/ui'
import { formatBold, fmtTime } from '../utils/format.jsx'

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

export function AssistantMessage({ m, onFeedback, onShare }) {
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

      {m.text && <p className="msg-ai-body">{formatBold(m.text)}</p>}

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
