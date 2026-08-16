// Light/Dark theme. Sets data-theme on <html>; the CSS tokens in index.css do
// the rest. Persisted per-browser in localStorage.

const KEY = 'sankatai_theme'

export const getTheme = () => {
  try { return localStorage.getItem(KEY) === 'dark' ? 'dark' : 'light' } catch { return 'light' }
}

export const applyTheme = (theme) => {
  const t = theme === 'dark' ? 'dark' : 'light'
  document.documentElement.setAttribute('data-theme', t)
  try { localStorage.setItem(KEY, t) } catch { /* ignore */ }
  return t
}

// Apply the saved theme on startup (no flash of the wrong theme).
export const initTheme = () => {
  const t = getTheme()
  document.documentElement.setAttribute('data-theme', t)
  return t
}
