// DEV-ONLY: quick layout/a11y probe used during visual QA (window.__qa()).
// Reports horizontal overflow, controls with no accessible name, touch targets
// under 44px, heading outline and the distinct computed font sizes/colours.
export const installQa = () => {
  window.__qa = () => {
    const vw = document.documentElement.clientWidth
    const visible = (e) => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden'
    const overflow = document.documentElement.scrollWidth > vw
    const wide = [...document.querySelectorAll('body *')]
      .filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('.att-tray, .ui-tip, [aria-hidden="true"], .sr-only') })
      .slice(0, 6).map((e) => (e.className?.baseVal ?? e.className) || e.tagName)
    const ctrls = [...document.querySelectorAll('button, a[href], input, select, textarea, [role="button"]')].filter(visible)
    const name = (e) => (e.getAttribute('aria-label') || e.getAttribute('aria-labelledby') || e.textContent || e.title || e.placeholder || (e.id && document.querySelector(`label[for="${e.id}"]`)?.textContent) || '').toString().trim()
    const unnamed = ctrls.filter((e) => !name(e) && e.type !== 'hidden').map((e) => e.outerHTML.slice(0, 100))
    const small = ctrls
      .filter((e) => !e.closest('.ui-tip, .sr-only, .ui-skip, p') && !['INPUT', 'SELECT', 'TEXTAREA'].includes(e.tagName))
      .map((e) => [e, e.getBoundingClientRect()])
      .filter(([, r]) => r.width < 44 || r.height < 44)
      .map(([e, r]) => `${String(e.className || e.tagName).slice(0, 36)} ${Math.round(r.width)}x${Math.round(r.height)} "${name(e).slice(0, 24)}"`)
    const headings = [...document.querySelectorAll('h1,h2,h3,h4')].filter(visible).map((e) => `${e.tagName}:${e.textContent.trim().slice(0, 30)}`)
    const all = [...document.querySelectorAll('body *')].filter(visible)
    const fonts = [...new Set(all.map((e) => getComputedStyle(e).fontSize))].sort((a, b) => parseFloat(a) - parseFloat(b))
    const colors = [...new Set(all.flatMap((e) => { const s = getComputedStyle(e); return [s.color, s.backgroundColor].filter((c) => c !== 'rgba(0, 0, 0, 0)') }))]
    return { vw, overflow, wide, unnamed, small, headings, fonts, colorCount: colors.length }
  }
}
