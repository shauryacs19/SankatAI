import { formatBold } from '../utils/format.jsx'

// A reply's plain text as readable blocks: paragraphs, bulleted and numbered
// lists, and "Label:" lines as small subheadings. **bold** is the only inline
// markup. Nothing is added or removed; this only changes how text is laid out.
const BULLET = /^\s*[-*\u2022]\s+(.+)$/
const NUMBERED = /^\s*\d{1,2}[.)]\s+(.+)$/
const HEADING = /^\s*(?:#{1,4}\s+(.+?)|([^.!?]{2,60}):)\s*$/

const toBlocks = (text) => {
  const blocks = []
  let para = []
  const flush = () => { if (para.length) { blocks.push({ type: 'p', lines: para }); para = [] } }
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trimEnd()
    let m
    if (!line.trim()) { flush(); continue }
    if ((m = line.match(BULLET)) || (m = line.match(NUMBERED))) {
      flush()
      const type = BULLET.test(line) ? 'ul' : 'ol'
      const last = blocks[blocks.length - 1]
      if (last && last.type === type) last.items.push(m[1])
      else blocks.push({ type, items: [m[1]] })
      continue
    }
    if ((m = line.replace(/\*\*/g, '').match(HEADING))) { flush(); blocks.push({ type: 'h', text: (m[1] || `${m[2]}:`).trim() }); continue }
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
