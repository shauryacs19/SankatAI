// A question typed on the home page before signing in. Kept in sessionStorage
// (this tab only, gone when it closes) and handed to the chat composer once,
// where the person reviews it and presses Send. Never sent automatically.

const KEY = 'sankatai:pending-question'
const MAX = 2000

export const savePendingQuestion = (text) => {
  try { sessionStorage.setItem(KEY, String(text).slice(0, MAX)) } catch { /* storage blocked: the question is simply not carried over */ }
}

export const hasPendingQuestion = () => {
  try { return Boolean(sessionStorage.getItem(KEY)) } catch { return false }
}

export const takePendingQuestion = () => {
  try {
    const text = sessionStorage.getItem(KEY) || ''
    sessionStorage.removeItem(KEY)
    return text
  } catch { return '' }
}
