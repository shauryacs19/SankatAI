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
