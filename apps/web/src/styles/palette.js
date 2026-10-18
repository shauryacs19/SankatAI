// Web-only visual identity: warm ivory, white surfaces, muted sage accents.
// The mobile app keeps reading @sankatai/shared/theme unchanged; only the web
// token layer (styles/tokens.js) reads these. Severity FILLS stay the shared,
// fixed values; only text inks are nudged where ivory needed it.
//
// Contrast (WCAG 2.x, measured): text-primary 10.7:1 on bg; text-secondary and
// text-muted ≥4.5:1 on bg, surface, surface-sunken and the user bubble;
// border-strong ≥3:1 on bg and surface; white on primary 5.7:1.

import { severityTokens } from '@sankatai/shared'

const light = {
  bg: '#F6F4ED', surface: '#FFFFFF', surfaceRaised: '#FFFFFF', surfaceSunken: '#EFEEE7', surfaceHover: '#F0F2ED',
  surfaceTint: '#E5EBE3', userBubble: '#E5EBE3',
  textPrimary: '#293B38', textSecondary: '#4A5652', textMuted: '#5E6964',
  borderSubtle: '#E8E9E5', borderDefault: '#D5D9D3', borderStrong: '#7D8681',
  focusRing: '#2F5A53', focusHalo: 'rgba(66, 111, 104, 0.20)',
  primary: '#426F68', primaryHover: '#375E58', primaryText: '#3B635C', onPrimary: '#FFFFFF',
  primarySoft: '#E5EBE3', primaryBorder: '#C5D3C9',
  success: '#1F7A4D', successSoft: '#EEF6EF', successBorder: '#BFDCC8',
  warning: '#A14A08', warningSoft: '#FCF3E6', warningBorder: '#EBCB9B',
  danger: '#B42318', dangerHover: '#912018', onDanger: '#FFFFFF', dangerSoft: '#FDF1EF', dangerBorder: '#F2C6C0',
  deviceBezel: '#1F2A28', // phone frame around home-page screenshots
  scrim: 'rgba(41, 59, 56, 0.42)', shadowColor: '41, 59, 56',
}

const dark = {
  bg: '#131918', surface: '#1A2120', surfaceRaised: '#212927', surfaceSunken: '#222A28', surfaceHover: '#27302E',
  surfaceTint: '#1E2E2B', userBubble: '#24332F',
  textPrimary: '#ECEFEA', textSecondary: '#C5CDC8', textMuted: '#9DA8A2',
  borderSubtle: '#2B3532', borderDefault: '#3B4744', borderStrong: '#6F7C77',
  focusRing: '#9CCBC1', focusHalo: 'rgba(143, 193, 182, 0.24)',
  primary: '#8FC1B6', primaryHover: '#A6D0C6', primaryText: '#9CCBC1', onPrimary: '#10221F',
  primarySoft: '#1E2E2B', primaryBorder: '#34524C',
  success: '#5FCB98', successSoft: '#152A22', successBorder: '#2C5A45',
  warning: '#F2B45A', warningSoft: '#2C2418', warningBorder: '#6A5228',
  danger: '#F28B82', dangerHover: '#F6A8A1', onDanger: '#1B0F0E', dangerSoft: '#2E1A1A', dangerBorder: '#6B3A37',
  deviceBezel: '#050807',
  scrim: 'rgba(5, 10, 9, 0.66)', shadowColor: '0, 0, 0',
}

export const webSemantic = { light, dark }

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
