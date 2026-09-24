// Light / Dark / System theme. The saved preference lives in localStorage (a UI
// preference only — never tokens). The RESOLVED theme is written to
// <html data-theme>; the CSS tokens in styles/tokens.js do the rest.
// Default is 'system', which follows prefers-color-scheme live.

const KEY = 'sankatai_theme'
export const THEME_PREFS = ['light', 'dark', 'system']

const media = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null)
const resolve = (pref) => (pref === 'system' ? (media()?.matches ? 'dark' : 'light') : pref)

export const getTheme = () => {
  try {
    const v = localStorage.getItem(KEY)
    return THEME_PREFS.includes(v) ? v : 'system'
  } catch { return 'system' }
}

let current = 'system'
const paint = () => document.documentElement.setAttribute('data-theme', resolve(current))

export const applyTheme = (pref) => {
  current = THEME_PREFS.includes(pref) ? pref : 'system'
  paint()
  try { localStorage.setItem(KEY, current) } catch { /* private mode: ignore */ }
  return current
}

// Apply the saved preference before first paint and keep 'system' in sync with
// the OS setting.
export const initTheme = () => {
  current = getTheme()
  paint()
  const m = media()
  if (m) {
    const onChange = () => { if (current === 'system') paint() }
    if (m.addEventListener) m.addEventListener('change', onChange)
    else if (m.addListener) m.addListener(onChange)
  }
  return current
}
