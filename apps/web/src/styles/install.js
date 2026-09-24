// Injects the global stylesheet once, before React renders, so the first paint
// already has tokens (no flash of unstyled or wrong-theme content).

import { TOKENS_CSS } from './tokens'
import { BASE_CSS, LEGACY_ALIASES_CSS } from './base'

export const installStyles = () => {
  if (document.getElementById('sk-global')) return
  const el = document.createElement('style')
  el.id = 'sk-global'
  el.textContent = TOKENS_CSS + BASE_CSS + LEGACY_ALIASES_CSS
  document.head.prepend(el)
}
