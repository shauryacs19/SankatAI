// Small formatting helpers for the admin dashboard.
export const fmt = (n) => (typeof n === 'number' ? n.toLocaleString('en-US') : n)

// Chart colors, derived from the existing SankatAI design tokens.
export const CHART = {
  primary: 'var(--primary, #C4504B)',
  users: 'var(--primary, #C4504B)',
  active: 'var(--sev-high, #EA580C)',
  returning: 'var(--sev-moderate, #CA8A04)',
  images: 'var(--primary, #C4504B)',
  documents: 'var(--sev-moderate, #CA8A04)',
  bar: 'var(--primary, #C4504B)',
  sevCritical: '#C4504B',
  sevHigh: '#EA580C',
  sevMedium: '#CA8A04',
  sevLow: '#059669',
}
