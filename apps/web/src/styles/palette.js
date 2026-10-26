// Web-only visual identity: warm ivory, white surfaces, muted sage accents.
// The mobile app keeps reading @sankatai/shared/theme unchanged; only the web
// token layer (styles/tokens.js) reads these. Severity FILLS stay the shared,
// fixed values; only text inks are nudged where ivory needed it.
//
// Contrast (WCAG 2.x, measured): text-primary 10.7:1 on bg; text-secondary and
// text-muted ≥4.5:1 on bg, surface, surface-sunken and the user bubble;
// border-strong ≥3:1 on bg and surface; white on primary 5.7:1.

import { semantic, severityTokens } from '@sankatai/shared'

// Web and native read the same brand colours and semantic surfaces. This file
// keeps web-only type, severity-ink and radius extras alongside that palette.
export const webSemantic = semantic

// MODERATE ink #A16207 is 4.47:1 on ivory, so the web uses a deeper amber.
export const webSeverity = {
  light: { ...severityTokens.light, MODERATE: { ...severityTokens.light.MODERATE, ink: '#8F5A06' } },
  dark: severityTokens.dark,
}

// Larger, senior-friendly scale: 17px body, nothing below 14px.
// [size px, line-height px]
export const webTypeScale = {
  xs: [14, 20], sm: [15, 22], md: [17, 27], lg: [19, 28], xl: [22, 30],
  '2xl': [28, 36], '3xl': [34, 42], '4xl': [48, 56],
}

export const webFontSans = '"Inter Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Noto Sans Devanagari", "Nirmala UI", "Helvetica Neue", Arial, sans-serif'

// Radius per element class.
export const webRadius = { control: 12, card: 16, modal: 20 }
