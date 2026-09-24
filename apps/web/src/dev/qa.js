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

// Rendered-colour contrast: every visible text node vs. its effective painted
// background (walking up through transparent ancestors). WCAG thresholds:
// 4.5:1 normal text, 3:1 large (≥24px, or ≥18.66px bold).
const parse = (c) => { const m = c.match(/[\d.]+/g); return m ? m.map(Number) : null }
const lum = ([r, g, b]) => { const f = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4 }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b) }
const ratio = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05) }
const blend = (fg, bg) => { const a = fg[3] ?? 1; return [0, 1, 2].map((i) => fg[i] * a + bg[i] * (1 - a)) }
const bgOf = (el) => {
  const layers = []
  for (let e = el; e; e = e.parentElement) {
    const c = parse(getComputedStyle(e).backgroundColor)
    if (c && (c[3] ?? 1) > 0) { layers.push(c); if ((c[3] ?? 1) >= 1) break }
  }
  let base = parse(getComputedStyle(document.body).backgroundColor).slice(0, 3)
  for (const l of layers.reverse()) base = blend(l, base)
  return base
}
export const installContrast = () => {
  window.__contrast = () => {
    const fails = []
    let checked = 0
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    const seen = new Set()
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const el = n.parentElement
      if (!n.textContent.trim() || !el || seen.has(el)) continue
      seen.add(el)
      if (!el.getClientRects().length || el.closest('.sr-only, [aria-hidden="true"], .ui-tip, .ui-skel') ) continue
      const s = getComputedStyle(el)
      if (s.visibility === 'hidden' || Number(s.opacity) === 0) continue
      if (el.closest('button:disabled, [aria-disabled="true"], input:disabled')) continue // WCAG exempts disabled controls
      const fg = parse(s.color); const bg = bgOf(el)
      const r = ratio(blend(fg, bg), bg)
      const size = parseFloat(s.fontSize); const bold = Number(s.fontWeight) >= 700
      const need = size >= 24 || (bold && size >= 18.66) ? 3 : 4.5
      checked++
      if (r < need) fails.push(`${r.toFixed(2)} < ${need}  "${n.textContent.trim().slice(0, 40)}"  ${s.color} on rgb(${bg.map(Math.round)})`)
    }
    return { theme: document.documentElement.dataset.theme, checked, fails }
  }
}
