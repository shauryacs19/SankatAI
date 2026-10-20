// Follow-up questionnaire logic (no React). The questions, their kind
// (yes_no | choice | text) and options come from the AI's reply; this turns what
// the person tapped/typed into the summary message + a structured payload.

export const OTHER = '__other__'

export const QN_TEXT = {
  en: {
    heading: 'My answers:', other: 'Other', otherPlaceholder: 'Type your answer', also: 'Also',
    note: 'Anything else to add? (optional)', send: 'Send answers', count: (a, n) => `${a} of ${n} answered`,
    step: (i, n) => `Question ${i} of ${n}`, prev: 'Previous question', nextQuestion: 'Next question', next: 'Next',
    reviewTitle: 'Review your answers', review: 'Review', skipped: 'Skipped', change: 'Change answer',
  },
  hi: {
    heading: 'मेरे जवाब:', other: 'अन्य', otherPlaceholder: 'अपना जवाब लिखें', also: 'और',
    note: 'कुछ और बताना है? (वैकल्पिक)', send: 'जवाब भेजें', count: (a, n) => `${n} में से ${a} जवाब दिए`,
    step: (i, n) => `सवाल ${i} / ${n}`, prev: 'पिछला सवाल', nextQuestion: 'अगला सवाल', next: 'आगे',
    reviewTitle: 'अपने जवाब देखें', review: 'जवाब देखें', skipped: 'छोड़ा', change: 'जवाब बदलें',
  },
}

// Items whose condition (e.g. temperature only after "fever: yes") is met.
export const visibleItems = (items, values) => items.filter((it) => !it.showIf || values[it.showIf.id] === it.showIf.value)

// The chosen option's label, or the typed text ("Other" or a text question), or null.
export const answerOf = (it, values, other) => {
  if (it.kind === 'text') return (other[it.id] || '').trim() || null
  const v = values[it.id]
  if (v === OTHER) return (other[it.id] || '').trim() || null
  return it.options.find((o) => o.value === v)?.label || null
}

// -> { text, answers }: the summary message and the structured payload.
export function composeAnswers(items, values, other, note, lang = 'en') {
  const t = QN_TEXT[lang] || QN_TEXT.en
  const shown = visibleItems(items, values)
  const lines = shown.flatMap((it) => {
    const label = answerOf(it, values, other)
    return label ? [`• ${it.short}: ${label}`] : []
  })
  const extra = (note || '').trim()
  if (extra) lines.push(`• ${t.also}: ${extra}`)
  const answered = shown.flatMap((it) => {
    const answer = answerOf(it, values, other)
    return answer ? [{ id: it.id, question: it.question, answer, kind: it.kind || 'choice' }] : []
  })
  return {
    text: [t.heading, ...lines].join('\n'),
    answers: { items: answered, ...(extra && { note: extra }) },
  }
}
