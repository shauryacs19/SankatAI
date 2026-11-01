// Text size preference: small / medium / large. Every size in the design system
// is in rem, so setting the root font size scales text (and its spacing) evenly.
// Stored in localStorage as a UI preference only. Default: medium (a step
// smaller than the browser's 16px).

const KEY = 'sankatai_text_size'
export const TEXT_SIZES = { small: '87.5%', medium: '93.75%', large: '100%' }

export const getTextSize = () => {
  try {
    const v = localStorage.getItem(KEY)
    return v in TEXT_SIZES ? v : 'medium'
  } catch { return 'medium' }
}

const paint = (size) => { document.documentElement.style.fontSize = TEXT_SIZES[size] }

export const applyTextSize = (size) => {
  const next = size in TEXT_SIZES ? size : 'medium'
  paint(next)
  try { localStorage.setItem(KEY, next) } catch { /* private mode: ignore */ }
  return next
}

// Before first paint.
export const initTextSize = () => { const s = getTextSize(); paint(s); return s }
