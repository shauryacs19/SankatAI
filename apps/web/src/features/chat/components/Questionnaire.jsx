// Follow-up questionnaire: the AI's questions from its reply, ONE AT A TIME,
// like a short guided flow. "Question 2 of 5" with ‹ › buttons and progress
// dots; options are rows you tap (or press 1-9). Picking an option moves on by
// itself; "Other" and text questions take typed answers (Enter or Next). The
// last step reviews every answer and sends ONE summary message, with each
// question and its answer alongside.
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { AnimatePresence, motion } from 'framer-motion'
import { useEffect, useId, useRef, useState } from 'react'
import { Check, ChevronLeft, ChevronRight, Send } from 'lucide-react'
import { Button, IconButton, Textarea } from '../../../components/ui'
import { OTHER, QN_TEXT, answerOf, composeAnswers, visibleItems } from '../utils/questionnaire'

const ADVANCE_MS = 260 // a beat to see the choice land before the next question

const slide = {
  enter: (dir) => ({ opacity: 0, x: dir * 24 }),
  center: { opacity: 1, x: 0, transition: { duration: 0.18, ease: 'easeOut' } },
  exit: (dir) => ({ opacity: 0, x: dir * -24, transition: { duration: 0.12, ease: 'easeIn' } }),
}

const rowsOf = (it, t) => (it.kind === 'text' ? [] : [...it.options, ...(it.allowOther ? [{ value: OTHER, label: t.other }] : [])])

function Step({ it, question, values, other, t, uid, onPick, onType, onNext }) {
  const typing = it.kind === 'text' || values[it.id] === OTHER
  const boxRef = useRef(null)
  useEffect(() => { if (typing) boxRef.current?.focus() }, [typing, it.id])
  const enterToNext = (e) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); onNext() }
  }
  const rows = rowsOf(it, t)
  return (
    <fieldset className="qn-step">
      <legend className="qn-q">{question}</legend>
      {rows.length > 0 && (
        <div className="qn-list">
          {rows.map((o, i) => {
            const checked = values[it.id] === o.value
            return (
              <label key={o.value} className={`qn-row ${checked ? 'is-checked' : ''}`}>
                <input type="radio" name={`${uid}-${it.id}`} value={o.value} checked={checked} onChange={() => onPick(o.value)} />
                <span className="qn-key" aria-hidden="true">{i + 1}</span>
                <span className="qn-label">{o.label}</span>
                {checked && <Check size={18} className="qn-tick" aria-hidden="true" />}
              </label>
            )
          })}
        </div>
      )}
      {typing && (
        <div className="qn-type">
          <Textarea ref={boxRef} rows={2} maxLength={300} value={other[it.id] || ''} placeholder={t.otherPlaceholder}
            aria-label={it.kind === 'text' ? question : `${it.short}: ${t.otherPlaceholder}`}
            onChange={(e) => onType(e.target.value)} onKeyDown={enterToNext} />
          <Button size="sm" variant="secondary" iconEnd={ChevronRight} onClick={onNext}
            disabled={!(other[it.id] || '').trim()}>{t.next}</Button>
        </div>
      )}
    </fieldset>
  )
}

function Review({ shown, values, other, note, setNote, t, onJump, onSend, busy, answered }) {
  return (
    <div className="qn-step">
      <p className="qn-q">{t.reviewTitle}</p>
      <ul className="qn-review">
        {shown.map((it, i) => {
          const a = answerOf(it, values, other)
          return (
            <li key={it.id}>
              <button type="button" className="qn-review-row" onClick={() => onJump(i)} aria-label={`${t.change}: ${it.short}`}>
                <span className="qn-review-q">{it.short}</span>
                <span className={`qn-review-a ${a ? '' : 'is-skipped'}`}>{a || t.skipped}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <Textarea rows={2} maxLength={1000} className="qn-note" value={note} placeholder={t.note} aria-label={t.note}
        onChange={(e) => setNote(e.target.value)} />
      <div className="qn-foot">
        <span className="qn-count">{t.count(answered, shown.length)}</span>
        <Button variant="primary" size="sm" icon={Send} onClick={onSend} disabled={!answered} loading={busy} loadingText="Sending…">{t.send}</Button>
      </div>
    </div>
  )
}

// `labels`: the questions in another language (a translated reply), same order.
export function Questionnaire({ items, labels, lang = 'en', interactive, onSubmit }) {
  const uid = useId()
  const t = QN_TEXT[lang] || QN_TEXT.en
  const [values, setValues] = useState({})
  const [other, setOther] = useState({})
  const [note, setNote] = useState('')
  const [step, setStep] = useState(0)
  const [dir, setDir] = useState(1)
  const [busy, setBusy] = useState(false)
  const timer = useRef(null)
  useEffect(() => () => clearTimeout(timer.current), [])
  const questionOf = (it) => labels?.[items.indexOf(it)] || it.question

  // Answered (sent) or not the latest reply: a plain list, like any reply.
  if (!interactive) {
    return <ol className="msg-ai-questions">{items.filter((it) => !it.showIf).map((it) => <li key={it.id}>{questionOf(it)}</li>)}</ol>
  }

  const shown = visibleItems(items, values)
  const total = shown.length
  const atReview = step >= total
  const it = shown[Math.min(step, total - 1)]
  const answered = shown.filter((q) => answerOf(q, values, other)).length
  const go = (next) => {
    clearTimeout(timer.current)
    const target = Math.max(0, Math.min(next, total))
    setDir(target >= step ? 1 : -1)
    setStep(target)
  }
  const pick = (value) => {
    setValues((v) => ({ ...v, [it.id]: value }))
    if (value === OTHER) return
    const from = step
    clearTimeout(timer.current)
    timer.current = setTimeout(() => { setDir(1); setStep((s) => (s === from ? s + 1 : s)) }, ADVANCE_MS)
  }
  const send = async () => {
    if (!answered || busy) return
    const { text, answers } = composeAnswers(items, values, other, note, lang)
    setBusy(true)
    try { await onSubmit(text, answers) } finally { setBusy(false) }
  }
  // 1-9 picks an option; ← / → move between questions (never while typing).
  const onKeyDown = (e) => {
    if (atReview || e.target.tagName === 'TEXTAREA' || e.altKey || e.ctrlKey || e.metaKey) return
    const rows = rowsOf(it, t)
    const n = Number(e.key)
    if (n >= 1 && n <= rows.length) { e.preventDefault(); pick(rows[n - 1].value) }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(step + 1) }
    else if (e.key === 'ArrowLeft') { e.preventDefault(); go(step - 1) }
  }

  return (
    <section className="qn" aria-label="Follow-up questions" onKeyDown={onKeyDown}>
      <header className="qn-head">
        <span className="qn-progress" aria-live="polite">{atReview ? t.review : t.step(step + 1, total)}</span>
        <span className="qn-dots" aria-hidden="true">
          {shown.map((q, i) => (
            <span key={q.id} className={`qn-dot ${i === step ? 'is-current' : ''} ${answerOf(q, values, other) ? 'is-done' : ''}`} />
          ))}
          <span className={`qn-dot qn-dot--review ${atReview ? 'is-current' : ''}`} />
        </span>
        <span className="qn-nav">
          <IconButton label={t.prev} icon={ChevronLeft} size={18} onClick={() => go(step - 1)} disabled={step === 0} />
          <IconButton label={t.nextQuestion} icon={ChevronRight} size={18} onClick={() => go(step + 1)}
            disabled={atReview} tooltipAlign="end" />
        </span>
      </header>
      <div className="qn-stage">
        <AnimatePresence mode="wait" initial={false} custom={dir}>
          <motion.div key={atReview ? 'review' : it.id} custom={dir} variants={slide} initial="enter" animate="center" exit="exit">
            {atReview ? (
              <Review shown={shown} values={values} other={other} note={note} setNote={setNote} t={t}
                onJump={go} onSend={send} busy={busy} answered={answered} />
            ) : (
              <Step it={it} question={questionOf(it)} values={values} other={other} t={t} uid={uid}
                onPick={pick} onType={(text) => setOther((o) => ({ ...o, [it.id]: text }))} onNext={() => go(step + 1)} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </section>
  )
}
