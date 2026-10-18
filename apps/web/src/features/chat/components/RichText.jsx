import { formatBold } from '../utils/format.jsx'

// A reply's plain text as readable blocks: paragraphs, bulleted and numbered
// lists, and "Label:" lines as small subheadings. **bold** is the only inline
// markup. Nothing is added or removed; this only changes how text is laid out.
// Patterns run on a trimmed line and anchor their capture on a non-space
// character, so none of them can backtrack over runs of whitespace.
const BULLET = /^[-*\u2022]\s+(\S.*)$/
const NUMBERED = /^\d{1,2}[.)]\s+(\S.*)$/
const MD_HEADING = /^#{1,4}\s+(\S.*)$/
const LABEL = /^[^.!?:]{2,60}:$/

const headingOf = (line) => {
  const plain = line.replaceAll('**', '')
  const md = MD_HEADING.exec(plain)
  if (md) return md[1]
  return LABEL.test(plain) ? plain : null
}

const toBlocks = (text) => {
  const blocks = []
  let para = []
  const flush = () => { if (para.length) { blocks.push({ type: 'p', lines: para }); para = [] } }
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim()
    if (!line) { flush(); continue }
    const bullet = BULLET.exec(line)
    const item = bullet || NUMBERED.exec(line)
    if (item) {
      flush()
      const type = bullet ? 'ul' : 'ol'
      const last = blocks.at(-1)
      if (last?.type === type) last.items.push(item[1])
      else blocks.push({ type, items: [item[1]] })
      continue
    }
    const heading = headingOf(line)
    if (heading) { flush(); blocks.push({ type: 'h', text: heading }); continue }
    para.push(line)
  }
  flush()
  return blocks
}

export function RichText({ text, className = '', lang }) {
  if (!text) return null
  const blocks = toBlocks(text)
  return (
    <div className={`rt ${className}`} lang={lang}>
      {blocks.map((b, i) => {
        if (b.type === 'ul') return <ul key={i}>{b.items.map((t, j) => <li key={j}>{formatBold(t)}</li>)}</ul>
        if (b.type === 'ol') return <ol key={i}>{b.items.map((t, j) => <li key={j}>{formatBold(t)}</li>)}</ol>
        if (b.type === 'h') return <p key={i} className="rt-h">{b.text}</p>
        return <p key={i}>{formatBold(b.lines.join('\n'))}</p>
      })}
    </div>
  )
}
