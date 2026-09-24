// "Auto-read replies to voice messages" (default off). A per-device UI
// preference, like the theme, so it lives in localStorage.
const KEY = 'sankatai_autoread'

export const getAutoRead = () => {
  try { return localStorage.getItem(KEY) === 'true' } catch { return false }
}

export const setAutoRead = (on) => {
  try { localStorage.setItem(KEY, on ? 'true' : 'false') } catch { /* private mode: ignore */ }
}

// Only replies to messages the user SPOKE are read automatically.
export const shouldAutoRead = (inputMode) => inputMode === 'voice' && getAutoRead()
