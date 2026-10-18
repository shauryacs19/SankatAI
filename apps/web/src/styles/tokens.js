// The ONE place design tokens become CSS custom properties. Structure (spacing,
// weights, motion, z-index) comes from @sankatai/shared/theme; the web's visual
// identity (colour, type scale, radius) comes from ./palette.js, so the mobile
// app is unaffected. Components read the semantic names (--surface,
// --text-muted, ...), never raw colours. See apps/web/DESIGN_SYSTEM.md.

import { neutral, fontWeight, space, motionTokens, zIndex } from '@sankatai/shared'
import { webSemantic, webSeverity, webTypeScale, webFontSans, webRadius } from './palette'

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const bezier = (p) => `cubic-bezier(${p.join(', ')})`

const themeVars = (mode) => {
  const s = webSemantic[mode]
  const lines = Object.entries(s)
    .filter(([k]) => k !== 'shadowColor')
    .map(([k, v]) => `--${kebab(k)}: ${v};`)
  for (const [level, t] of Object.entries(webSeverity[mode])) {
    const n = level.toLowerCase()
    lines.push(`--sev-${n}: ${t.fill}; --sev-${n}-ink: ${t.ink}; --sev-${n}-soft: ${t.soft}; --sev-${n}-border: ${t.border};`)
  }
  // Elevation: at most three levels, only for genuinely floating things.
  const c = s.shadowColor
  lines.push(
    `--shadow-0: 0 1px 2px rgba(${c}, 0.04);`, // selected segment
    `--shadow-lift: 0 1px 2px rgba(${c}, 0.04), 0 12px 32px rgba(${c}, 0.06);`, // the question box (the page's focal point)
    `--shadow-device: 0 2px 6px rgba(${c}, 0.05), 0 28px 64px -18px rgba(${c}, 0.32);`, // product screenshots on the home page
    `--shadow-1: 0 1px 2px rgba(${c}, 0.05), 0 6px 16px rgba(${c}, 0.07);`, // popover, dropdown
    `--shadow-2: 0 10px 28px rgba(${c}, 0.12);`, // drawer, toast
    `--shadow-3: 0 18px 48px rgba(${c}, 0.18);`, // modal
    `color-scheme: ${mode};`,
  )
  return lines.join('\n  ')
}

const staticVars = () => {
  const lines = [`--font-sans: ${webFontSans};`]
  for (const [k, v] of Object.entries(neutral)) lines.push(`--n-${k}: ${v};`)
  for (const [k, [size, lh]] of Object.entries(webTypeScale)) lines.push(`--fs-${k}: ${size / 16}rem; --lh-${k}: ${lh / 16}rem;`)
  for (const [k, v] of Object.entries(fontWeight)) lines.push(`--fw-${k}: ${v};`)
  // Shared 4px grid plus three larger steps for page-level rhythm.
  for (const [k, v] of Object.entries({ ...space, 7: 28, 14: 56, 20: 80, 24: 96 })) lines.push(`--space-${k}: ${v / 16}rem;`)
  // Radius per element class: controls share one, cards another, modals a third.
  lines.push(
    `--radius-control: ${webRadius.control}px;`,
    `--radius-card: ${webRadius.card}px;`,
    `--radius-modal: ${webRadius.modal}px;`,
    '--radius-pill: 999px;',
  )
  for (const [k, v] of Object.entries(motionTokens.duration)) lines.push(`--dur-${k}: ${v}ms;`)
  for (const [k, v] of Object.entries(motionTokens.easing)) lines.push(`--ease-${k}: ${bezier(v)};`)
  for (const [k, v] of Object.entries(zIndex)) lines.push(`--z-${k}: ${v};`)
  // Layout constants.
  // Life-critical fill hover: stays vivid red in both themes (white text 6.47:1).
  lines.push(`--sev-emergency-hover: ${webSeverity.light.EMERGENCY.ink};`, `--on-emergency: ${neutral[0]};`)
  lines.push('--content-reading: 45rem;', '--content-wide: 60rem;', '--content-page: 72rem;', '--control-h: 3rem;', '--control-h-sm: 2.5rem;', '--touch: 2.75rem;')
  return lines.join('\n  ')
}

export const TOKENS_CSS = `
:root {
  ${staticVars()}
  ${themeVars('light')}
}
:root[data-theme="dark"] {
  ${themeVars('dark')}
}
`
