// Shared design tokens (framework-agnostic). Light + dark palettes; the mobile
// ThemeContext and the web CSS tokens both draw from these values.

export const radius = { sm: 8, md: 12, lg: 16, xl: 20 }

// Severity colours are constant across themes. EMERGENCY keeps the ORIGINAL
// vivid red — life-critical actions (SOS, call ambulance, emergency call) must
// stay loud even though the general brand red was softened.
const SEVERITY = { LOW: '#059669', MODERATE: '#CA8A04', HIGH: '#EA580C', EMERGENCY: '#DC2626' }
export const sevColor = (severity) => SEVERITY[severity] || '#64748B'

export const lightColors = {
  bg: '#F8FAFC',
  surface: '#FFFFFF',
  surface2: '#F1F5F9',
  border: '#E5E7EB',
  text: '#0F172A',
  textSecondary: '#334155',
  muted: '#64748B',
  // Softer, less saturated brand red (was #DC2626 — too bright).
  // White text on this passes AA (4.57:1).
  primary: '#C4504B',
  primaryHover: '#A93F3B',
  primarySoft: '#FBF1F0',
  primaryBorder: '#F0CFCD',
  success: '#059669',
  sevLow: SEVERITY.LOW, sevModerate: SEVERITY.MODERATE, sevHigh: SEVERITY.HIGH, sevEmergency: SEVERITY.EMERGENCY,
}

export const darkColors = {
  bg: '#0B1220',
  surface: '#111827',
  surface2: '#1F2937',
  border: '#334155',
  text: '#F1F5F9',
  textSecondary: '#CBD5E1',
  muted: '#94A3B8',
  // Muted red for dark surfaces (was #EF4444 — glaring on #0B1220).
  primary: '#D9635E',
  primaryHover: '#E0736E',
  primarySoft: '#33191A',
  primaryBorder: '#6E3330',
  success: '#34D399',
  sevLow: SEVERITY.LOW, sevModerate: SEVERITY.MODERATE, sevHigh: SEVERITY.HIGH, sevEmergency: SEVERITY.EMERGENCY,
}

export const palettes = { light: lightColors, dark: darkColors }

// ---------------------------------------------------------------------------
// Design-system tokens (additive — everything above is unchanged for mobile).
// The web app turns these into CSS custom properties in one place
// (apps/web/src/styles/tokens.js); nothing on the web picks raw values.
// ---------------------------------------------------------------------------

// The fixed severity fills, exported for fills/dots/bars/borders. NEVER tinted.
export const SEVERITY_COLORS = SEVERITY

// Slate neutral scale (the neutrals already used by both palettes).
export const neutral = {
  0: '#FFFFFF', 50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1', 400: '#94A3B8',
  500: '#64748B', 600: '#475569', 700: '#334155', 800: '#1E293B', 900: '#0F172A', 950: '#0B1220',
}

// Semantic aliases. Components use these, never the scale directly.
// Contrast (WCAG 2.x, verified): text-primary/secondary/muted ≥4.5:1 on bg,
// surface and surface-sunken; border-strong ≥3:1 on surface (inputs, controls);
// on-primary ≥4.5:1 on primary. White on #D9635E is only 3.56:1, so dark
// mode puts dark ink on the primary fill instead.
const semanticLight = {
  bg: neutral[50], surface: neutral[0], surfaceRaised: neutral[0], surfaceSunken: neutral[100], surfaceHover: neutral[100],
  textPrimary: neutral[900], textSecondary: neutral[700], textMuted: '#5B6B80', // #64748B is 4.34:1 on surface-sunken
  borderSubtle: neutral[200], borderDefault: neutral[300], borderStrong: '#8492A6',
  focusRing: neutral[900],
  primary: lightColors.primary, primaryHover: lightColors.primaryHover, primaryText: '#A93F3B', onPrimary: '#FFFFFF',
  primarySoft: lightColors.primarySoft, primaryBorder: lightColors.primaryBorder,
  success: '#047857', successSoft: '#ECFDF5', successBorder: '#A7F3D0',
  warning: '#B45309', warningSoft: '#FFFBEB', warningBorder: '#FDE68A',
  danger: '#B91C1C', dangerHover: '#991B1B', onDanger: '#FFFFFF', dangerSoft: '#FEF2F2', dangerBorder: '#FECACA',
  scrim: 'rgba(15, 23, 42, 0.48)', shadowColor: '15, 23, 42',
}
const semanticDark = {
  bg: neutral[950], surface: '#111827', surfaceRaised: '#1F2937', surfaceSunken: '#1F2937', surfaceHover: '#1F2937',
  textPrimary: neutral[100], textSecondary: neutral[300], textMuted: neutral[400],
  borderSubtle: '#263244', borderDefault: neutral[700], borderStrong: '#6B7A90',
  focusRing: neutral[100],
  primary: darkColors.primary, primaryHover: darkColors.primaryHover, primaryText: '#E0736E', onPrimary: neutral[950],
  primarySoft: darkColors.primarySoft, primaryBorder: darkColors.primaryBorder,
  success: '#34D399', successSoft: '#0F2C32', successBorder: '#1F6355',
  warning: '#FBBF24', warningSoft: '#2F2A21', warningBorder: '#6E6020',
  danger: '#F87171', dangerHover: '#FCA5A5', onDanger: neutral[950], dangerSoft: '#311A27', dangerBorder: '#6D3C45',
  scrim: 'rgba(2, 6, 23, 0.64)', shadowColor: '0, 0, 0',
}
export const semantic = { light: semanticLight, dark: semanticDark }

// Severity presentation per theme. `fill` is the fixed severity colour (same in
// both themes, for dots/bars/borders/solid buttons). `ink` is the text-safe
// companion (≥4.5:1 on surface and on `soft`), used only for text — the fixed
// fills are too light for small text on white (MODERATE is 2.94:1).
export const severityTokens = {
  light: {
    LOW: { fill: SEVERITY.LOW, ink: '#047857', soft: '#ECFDF5', border: '#A7F3D0' },
    MODERATE: { fill: SEVERITY.MODERATE, ink: '#A16207', soft: '#FEFCE8', border: '#FDE68A' },
    HIGH: { fill: SEVERITY.HIGH, ink: '#C2410C', soft: '#FFF7ED', border: '#FED7AA' },
    EMERGENCY: { fill: SEVERITY.EMERGENCY, ink: '#B91C1C', soft: '#FEF2F2', border: '#FECACA' },
  },
  dark: {
    LOW: { fill: SEVERITY.LOW, ink: '#34D399', soft: '#0F2C32', border: '#1F6355' },
    MODERATE: { fill: SEVERITY.MODERATE, ink: '#FACC15', soft: '#2F2A21', border: '#6E6020' },
    HIGH: { fill: SEVERITY.HIGH, ink: '#FB923C', soft: '#342223', border: '#6F492F' },
    EMERGENCY: { fill: SEVERITY.EMERGENCY, ink: '#F87171', soft: '#311A27', border: '#6D3C45' },
  },
}

// Type scale (~1.2 ratio). [size px, line-height px]. Weights 400/500/600/700.
export const typeScale = {
  xs: [12, 16], sm: [14, 20], md: [16, 24], lg: [18, 26], xl: [20, 28], '2xl': [24, 32], '3xl': [30, 38], '4xl': [36, 44],
}
export const fontWeight = { regular: 400, medium: 500, semibold: 600, bold: 700 }
export const fontSans = 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", "Helvetica Neue", Arial, sans-serif'

// 4px spacing grid.
export const space = { 1: 4, 2: 8, 3: 12, 4: 16, 5: 20, 6: 24, 8: 32, 10: 40, 12: 48, 16: 64 }

// Motion: durations (ms) and easings (cubic-bezier control points).
export const motionTokens = {
  duration: { fast: 120, base: 180, slow: 240, slower: 320 },
  easing: { standard: [0.2, 0, 0, 1], enter: [0, 0, 0.2, 1], exit: [0.4, 0, 1, 1] },
}

export const zIndex = { sticky: 100, dropdown: 200, overlay: 300, modal: 400, toast: 500, skip: 600 }
export const breakpoints = { sm: 480, md: 768, lg: 1024, xl: 1440 }
