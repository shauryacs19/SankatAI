// Message rows. Three visibly different kinds, so nothing can pass for
// something it isn't: the user's own message, an AI assessment (or, visibly
// different, an OFFLINE keyword estimate), and a failed-send error row.

// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useRef, useState } from 'react'
import {
  Heart, HeartPulse, CloudOff, FileText, ShieldCheck, ThumbsUp, ThumbsDown, Share2, MoreVertical, Trash2,
  CheckCheck, AlertTriangle, Ambulance, RotateCw, Languages, MapPin,
} from 'lucide-react'
import SpeakerButton from '../tts/SpeakerButton.jsx'
import {
  AI_DISCLAIMER, EMERGENCY_CALLOUT, TRANSLATION_LABELS, TRANSLATION_NAMES, nextTranslation, replyLanguageOf,
} from '@sankatai/shared'
import { Alert, Button, Chip, IconButton, Input, Menu, SeverityBadge, severityUi, messageEnter, useToast } from '../../../components/ui'
import { errText } from '../../../utils/errText'
import { translateMessage } from '../services/chatApi'
import { formatBold, fmtTime, normalizeAssistant } from '../utils/format.jsx'
import { RichText } from './RichText.jsx'
import { Questionnaire } from './Questionnaire.jsx'

export function UserMessage({ m, attachments, onOpenAtt, onUnsend }) {
  const canUnsend = Boolean(onUnsend) && m.status !== 'sent' && m.status !== 'failed' && !String(m.id).startsWith('tmp-')
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
  const texts = useRef({ [original]: { text: m.text, questions: m.questions, details: m.details, intro: m.intro } })
  const next = nextTranslation(shown)
  const advance = async () => {
    if (busy) return
    if (texts.current[next] === undefined) {
      setBusy(true)
      try {
        const res = await translateMessage(consultationId, m.id, next)
        const n = normalizeAssistant(res.content)
        texts.current[next] = { text: n.text, questions: n.questions, details: n.details, intro: n.intro }
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
  const cur = translated ? texts.current[shown] : { text: m.text, questions: m.questions, details: m.details, intro: m.intro }
  return { text: cur.text, questions: cur.questions, details: cur.details || m.details, intro: cur.intro ?? m.intro, shown, next, busy, advance, translated }
}

// The structured parts of a v2 assessment. Home care only for LOW/MODERATE
// (the engine never sends it for HIGH/EMERGENCY either).
function AssessmentDetails({ d, severity, lang }) {
  const lists = [
    ['What you can do now', severity === 'LOW' || severity === 'MODERATE' ? d.homeCare : []],
    ['Get help sooner if', d.warningSigns],
    ['Possible causes', d.likelyCauses],
  ].filter(([, items]) => items.length)
  return (
    <div className="msg-ai-details" lang={lang}>
      {d.seekCare && <div className="msg-ai-sec msg-ai-sec--care"><h3>When to get care</h3><p>{d.seekCare}</p></div>}
      {lists.map(([title, items]) => (
        <div key={title} className="msg-ai-sec"><h3>{title}</h3><ul className="ui-list">{items.map((x) => <li key={x}>{x}</li>)}</ul></div>
      ))}
      {d.reasoning && <div className="msg-ai-sec"><h3>Why this rating</h3><p>{d.reasoning}</p></div>}
    </div>
  )
}

const FEEDBACK_REASONS = [
  { key: 'inaccurate', label: 'Inaccurate' },
  { key: 'too_generic', label: 'Too generic' },
  { key: 'wrong_severity', label: 'Wrong severity' },
]

// Shown after "No": an optional reason (and for a wrong severity, which way),
// plus an optional comment. Everything is stored anonymised to improve triage.
export function FeedbackFollowUp({ messageId, onSubmit, onClose }) {
  const [reason, setReason] = useState(null)
  const [direction, setDirection] = useState(null)
  const [comment, setComment] = useState('')
  const [busy, setBusy] = useState(false)
  const send = async () => {
    setBusy(true)
    const ok = await onSubmit({
      ...(reason && { reason }),
      ...(reason === 'wrong_severity' && direction && { direction }),
      ...(comment.trim() && { comment: comment.trim() }),
    })
    setBusy(false)
    if (ok !== false) onClose(true)
  }
  return (
    <div className="msg-fb-more" role="group" aria-labelledby={`fbm-${messageId}`}>
      <p className="msg-fb-more-title" id={`fbm-${messageId}`}>What was wrong? <span>(optional)</span></p>
      <div className="msg-fb-chips">
        {FEEDBACK_REASONS.map((r) => (
          <Chip key={r.key} aria-pressed={reason === r.key} onClick={() => setReason(reason === r.key ? null : r.key)}>{r.label}</Chip>
        ))}
      </div>
      {reason === 'wrong_severity' && (
        <div className="msg-fb-chips" role="group" aria-label="It should have been">
          <span className="msg-fb-more-sub">It should have been</span>
          <Chip aria-pressed={direction === 'higher'} onClick={() => setDirection('higher')}>More serious</Chip>
          <Chip aria-pressed={direction === 'lower'} onClick={() => setDirection('lower')}>Less serious</Chip>
        </div>
      )}
      <Input value={comment} onChange={(e) => setComment(e.target.value.slice(0, 280))} maxLength={280}
        placeholder="Anything else? Please leave out names and phone numbers." aria-label="Comment (optional)" />
      <div className="msg-fb-actions">
        <Button size="sm" variant="secondary" onClick={send} loading={busy} loadingText="Sending…" disabled={!reason && !comment.trim()}>Send</Button>
        <Button size="sm" variant="ghost" onClick={() => onClose(false)}>Skip</Button>
      </div>
    </div>
  )
}

const THANKS_MS = 2600
const THANKS_TEXT = {
  like: 'Glad it helped.',
  dislike: 'It helps SankatAI give better answers.',
}

// A small "thanks" popup above the Yes / No buttons: it springs up, its heart
// pops in with a ring pulse, then it leaves by itself. (The app's MotionConfig
// drops the movement for people who prefer reduced motion.)
function ThanksPop({ kind }) {
  return (
    <AnimatePresence>
      {kind && (
        <motion.div key={kind} className="fb-pop" role="status"
          initial={{ opacity: 0, y: 10, scale: 0.9 }}
          animate={{ opacity: 1, y: 0, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 26 } }}
          exit={{ opacity: 0, y: -6, scale: 0.96, transition: { duration: 0.18 } }}>
          <span className="fb-pop-icon" aria-hidden="true">
            <motion.span className="fb-pop-ring" initial={{ opacity: 0.7, scale: 0.6 }} animate={{ opacity: 0, scale: 1.7 }}
              transition={{ duration: 0.9, ease: 'easeOut', delay: 0.1 }} />
            <motion.span initial={{ scale: 0, rotate: -25 }} animate={{ scale: [0, 1.3, 1], rotate: 0 }}
              transition={{ duration: 0.45, times: [0, 0.6, 1], delay: 0.08 }} style={{ display: 'inline-grid' }}>
              <Heart size={18} fill="currentColor" />
            </motion.span>
          </span>
          <span><strong>Thanks for your feedback!</strong>{THANKS_TEXT[kind]}</span>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

// `guest`: a home-page guest reply. Feedback, translation and read-aloud need an
// account (they are stored per message), so a guest gets Share only.
// `interactive`: this is the newest reply and nothing is sending, so its
// questionnaire (if any) can be answered; `onAnswer(text, answers)` sends it.
// `onNearby`: shows nearby hospitals / clinics for this assessment as the next
// message (null once they are shown; a risk score >= 65 shows them by itself).
export function AssistantMessage({ m, onFeedback, onFeedbackDetail, onShare, consultationId, guest = false, interactive = false, onAnswer, onNearby }) {
  const tr = useTranslationCycle(m, consultationId)
  const [fbMore, setFbMore] = useState(false)
  const [thanks, setThanks] = useState(null) // null | 'like' | 'dislike': which popup is showing
  useEffect(() => {
    if (!thanks) return undefined
    const id = setTimeout(() => setThanks(null), THANKS_MS)
    return () => clearTimeout(id)
  }, [thanks])
  const details = tr.details
  const confidence = m.severity && details?.confidence != null ? Math.round(details.confidence * 100) : null
  const replyLang = tr.shown === 'hi' ? 'hi' : 'en'
  // Yes thanks straight away; No first asks why (optional), then thanks.
  // Tapping the active choice again clears the vote: no popup.
  const vote = (value) => {
    onFeedback(m.id, value)
    const setting = m.feedback !== value
    const askWhy = value === 'dislike' && setting && Boolean(onFeedbackDetail)
    setFbMore(askWhy)
    setThanks(setting && !askWhy ? value : null)
  }
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
        {sev && (
          <span className="msg-ai-sev">
            <SeverityBadge severity={m.severity} score={m.riskScore} size="lg" />
            {confidence != null && <span className="msg-ai-conf" title="How sure the triage model is about this rating">{confidence}% confident</span>}
          </span>
        )}
      </header>

      {offline && (
        <Alert tone="warning" title="Offline mode — this is not an AI assessment.">
          The AI assistant is unavailable, so this is an automatic keyword estimate. If this could be an emergency, <a href="tel:108"><strong>call 108</strong></a>.
        </Alert>
      )}

      {m.questionnaire ? (
        <div className="msg-ai-body rt" lang={replyLang}>
          {tr.intro && <p>{tr.intro}</p>}
          <Questionnaire items={m.questionnaire} labels={tr.translated ? tr.questions : null} lang={replyLanguageOf(m.lang, m.raw) === 'hi' ? 'hi' : 'en'}
            interactive={interactive && Boolean(onAnswer)} onSubmit={onAnswer} />
        </div>
      ) : tr.questions?.length > 1 ? (
        <div className="msg-ai-body rt" lang={tr.shown === 'hi' ? 'hi' : 'en'}>
          <p className="rt-h">To understand better, please tell me:</p>
          <ol className="msg-ai-questions">{tr.questions.map((q, i) => <li key={i}>{formatBold(q)}</li>)}</ol>
        </div>
      ) : (
        tr.text && <RichText className="msg-ai-body" text={tr.text} lang={tr.shown === 'hi' ? 'hi' : 'en'} />
      )}
      {details?.safetyNote && !m.severity && (
        <p className="msg-ai-note"><AlertTriangle size={16} aria-hidden="true" /><span>{details.safetyNote} <a href="tel:108"><strong>Call 108</strong></a></span></p>
      )}
      {m.severity && details && <AssessmentDetails d={details} severity={m.severity} lang={replyLang} />}
      {tr.translated && <p className="msg-ai-translated">Translated to {TRANSLATION_NAMES[tr.shown]}</p>}

      {m.severity === 'EMERGENCY' && (
        <div className="msg-ai-call">
          <p>{EMERGENCY_CALLOUT}</p>
          <Button variant="emergency" icon={Ambulance} href="tel:108">Call 108 now</Button>
        </div>
      )}

      {m.severity && onNearby && !guest && (
        <div className="msg-ai-nearby">
          <Button size="sm" variant="secondary" icon={MapPin} onClick={onNearby}>Show nearby hospitals for this issue</Button>
        </div>
      )}

      {Array.isArray(m.recommendations) && m.recommendations.length > 0 && (
        <div className="an-section">
          <h3>Recommendations</h3>
          <ul className="ui-list">{m.recommendations.map((r, i) => <li key={i}>{r}</li>)}</ul>
        </div>
      )}
      {m.followUp && <RichText className="msg-ai-body" text={m.followUp} />}

      {/* Always shown, questions included: guidance, never a diagnosis. */}
      <p className="msg-ai-disclaimer"><ShieldCheck size={14} aria-hidden="true" /><span>{AI_DISCLAIMER}</span></p>

      {guest && (
        <footer className="msg-ai-foot">
          <Button size="sm" variant="ghost" icon={Share2} className="msg-ai-share" onClick={() => onShare(m)}>Share or copy</Button>
        </footer>
      )}
      {!guest && canFeedback && (
        <footer className="msg-ai-foot">
          <span className="msg-ai-foot-label" id={`fb-${m.id}`}>Was this helpful?</span>
          <span className="msg-ai-fb-wrap">
            <div role="group" aria-labelledby={`fb-${m.id}`} className="msg-ai-fb">
              <Button size="sm" variant="ghost" icon={ThumbsUp} aria-pressed={m.feedback === 'like'} onClick={() => vote('like')}>Yes</Button>
              <Button size="sm" variant="ghost" icon={ThumbsDown} aria-pressed={m.feedback === 'dislike'} onClick={() => vote('dislike')}>No</Button>
            </div>
            <ThanksPop kind={thanks} />
          </span>
          <Button size="sm" variant="ghost" icon={Languages} className="msg-ai-translate" onClick={tr.advance}
            loading={tr.busy} loadingText="Translating…" aria-label={`Show this reply in ${TRANSLATION_NAMES[tr.next]}`}
            hint={`Show this reply in ${TRANSLATION_NAMES[tr.next]}`}>
            {TRANSLATION_LABELS[tr.next]}
          </Button>
          <SpeakerButton consultationId={consultationId} messageId={m.id} variant={tr.translated ? tr.shown : undefined} />
          <IconButton className="msg-ai-share" label="Share this response" icon={Share2} size={16} onClick={() => onShare(m)} tooltipAlign="end" />
        </footer>
      )}
      {!guest && fbMore && m.feedback === 'dislike' && (
        <FeedbackFollowUp messageId={m.id} onSubmit={(extra) => onFeedbackDetail(m.id, extra)}
          onClose={() => { setFbMore(false); setThanks('dislike') }} />
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
      <span>Analysing your symptoms</span>
      <span className="msg-dots" aria-hidden="true"><span /><span /><span /></span>
    </div>
  )
}
