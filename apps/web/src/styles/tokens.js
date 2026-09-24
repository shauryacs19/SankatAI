// The ONE place design tokens become CSS custom properties. Every value comes
// from @sankatai/shared/theme (shared with mobile), so the web can't drift from
// it. Components read the semantic names (--surface, --text-muted, ...), never
// raw colours. See apps/web/DESIGN_SYSTEM.md for usage rules.

import {
  neutral, semantic, severityTokens, typeScale, fontWeight, fontSans, space, radius,
  motionTokens, zIndex,
} from '@sankatai/shared'

const kebab = (s) => s.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)
const bezier = (p) => `cubic-bezier(${p.join(', ')})`

const themeVars = (mode) => {
  const s = semantic[mode]
  const lines = Object.entries(s)
    .filter(([k]) => k !== 'shadowColor')
    .map(([k, v]) => `--${kebab(k)}: ${v};`)
  for (const [level, t] of Object.entries(severityTokens[mode])) {
    const n = level.toLowerCase()
    lines.push(`--sev-${n}: ${t.fill}; --sev-${n}-ink: ${t.ink}; --sev-${n}-soft: ${t.soft}; --sev-${n}-border: ${t.border};`)
  }
  // Elevation: at most three levels, only for genuinely floating things.
  const c = s.shadowColor
  lines.push(
    `--shadow-1: 0 1px 2px rgba(${c}, 0.06), 0 4px 12px rgba(${c}, 0.08);`, // popover, dropdown
    `--shadow-2: 0 8px 24px rgba(${c}, 0.14);`, // drawer, toast
    `--shadow-3: 0 16px 48px rgba(${c}, 0.22);`, // modal
    `color-scheme: ${mode};`,
  )
  return lines.join('\n  ')
}

const staticVars = () => {
  const lines = [`--font-sans: ${fontSans};`]
  for (const [k, v] of Object.entries(neutral)) lines.push(`--n-${k}: ${v};`)
  for (const [k, [size, lh]] of Object.entries(typeScale)) lines.push(`--fs-${k}: ${size / 16}rem; --lh-${k}: ${lh / 16}rem;`)
  for (const [k, v] of Object.entries(fontWeight)) lines.push(`--fw-${k}: ${v};`)
  for (const [k, v] of Object.entries(space)) lines.push(`--space-${k}: ${v / 16}rem;`)
  // Radius per element class: controls share one, cards another, modals a third.
  lines.push(
    `--radius-control: ${radius.sm}px;`,
    `--radius-card: ${radius.md}px;`,
    `--radius-modal: ${radius.lg}px;`,
    '--radius-pill: 999px;',
  )
  for (const [k, v] of Object.entries(motionTokens.duration)) lines.push(`--dur-${k}: ${v}ms;`)
  for (const [k, v] of Object.entries(motionTokens.easing)) lines.push(`--ease-${k}: ${bezier(v)};`)
  for (const [k, v] of Object.entries(zIndex)) lines.push(`--z-${k}: ${v};`)
  // Layout constants.
  lines.push('--content-reading: 45rem;', '--content-wide: 60rem;', '--control-h: 2.75rem;', '--control-h-sm: 2.25rem;', '--touch: 2.75rem;')
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
