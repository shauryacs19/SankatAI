// Shared design tokens (framework-agnostic). This is the canonical product
// identity for both the web and mobile clients.

export const radius = { sm: 8, md: 12, lg: 16, xl: 20 }

// Severity colours are constant across themes. EMERGENCY stays red for
// life-critical actions; sage is reserved for normal product actions.
const SEVERITY = { LOW: '#059669', MODERATE: '#CA8A04', HIGH: '#EA580C', EMERGENCY: '#DC2626' }
export const sevColor = (severity) => SEVERITY[severity] || '#64748B'

// ---------------------------------------------------------------------------
// Semantic palettes. Both apps consume the same values; platform-specific
// aliases are provided below for existing React Native screens.
// ---------------------------------------------------------------------------

// The fixed severity fills, exported for fills/dots/bars/borders. NEVER tinted.
export const SEVERITY_COLORS = SEVERITY

// Slate neutral scale (the neutrals already used by both palettes).
export const neutral = {
  0: '#FFFFFF', 50: '#F8FAFC', 100: '#F1F5F9', 200: '#E2E8F0', 300: '#CBD5E1', 400: '#94A3B8',
  500: '#64748B', 600: '#475569', 700: '#334155', 800: '#1E293B', 900: '#0F172A', 950: '#0B1220',
}

// Semantic aliases. Components use these, never the scale directly.
// The warm-sage light and dark values are shared by web CSS and native styles.
const semanticLight = {
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
  scrim: 'rgba(41, 59, 56, 0.42)', shadowColor: '41, 59, 56', deviceBezel: '#1F2A28',
}
const semanticDark = {
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
  scrim: 'rgba(5, 10, 9, 0.66)', shadowColor: '0, 0, 0', deviceBezel: '#050807',
}
export const semantic = { light: semanticLight, dark: semanticDark }

// Legacy-friendly aliases used by the native screens. Values map 1:1 to the
// semantic palette above so the web and native experiences cannot drift apart.
const nativeColors = (s) => ({
  bg: s.bg, surface: s.surface, surface2: s.surfaceSunken, surfaceSunken: s.surfaceSunken, surfaceTint: s.surfaceTint, userBubble: s.userBubble, border: s.borderSubtle,
  text: s.textPrimary, textSecondary: s.textSecondary, muted: s.textMuted,
  primary: s.primary, primaryText: s.primaryText, primaryHover: s.primaryHover, primarySoft: s.primarySoft, primaryBorder: s.primaryBorder,
  onPrimary: s.onPrimary, scrim: s.scrim,
  success: s.success, successSoft: s.successSoft, successBorder: s.successBorder,
  warning: s.warning, warningSoft: s.warningSoft, warningBorder: s.warningBorder,
  danger: s.danger, dangerHover: s.dangerHover, onDanger: s.onDanger, dangerSoft: s.dangerSoft, dangerBorder: s.dangerBorder,
  sevLow: SEVERITY.LOW, sevModerate: SEVERITY.MODERATE, sevHigh: SEVERITY.HIGH, sevEmergency: SEVERITY.EMERGENCY,
})
export const lightColors = nativeColors(semanticLight)
export const darkColors = nativeColors(semanticDark)
export const palettes = { light: lightColors, dark: darkColors }

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
