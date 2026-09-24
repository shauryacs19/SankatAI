import { HeartPulse } from 'lucide-react'
import { severityUi } from './severity'

export function Badge({ tone = 'neutral', icon: Icon, outline = false, href, children, className = '', ...rest }) {
  const cls = `ui-badge ${tone !== 'neutral' ? `ui-badge--${tone}` : ''} ${outline ? 'ui-badge--outline' : ''} ${className}`
  const inner = <>{Icon && <Icon size={12} aria-hidden="true" />}{children}</>
  return href ? <a href={href} className={cls} {...rest}>{inner}</a> : <span className={cls} {...rest}>{inner}</span>
}

export function Chip({ icon: Icon, children, className = '', ...rest }) {
  return (
    <button type="button" className={`ui-chip ${className}`} {...rest}>
      {Icon && <Icon size={16} aria-hidden="true" />}{children}
    </button>
  )
}

export function SeverityBadge({ severity, score, size = 'md' }) {
  const s = severityUi(severity)
  if (!s) return null
  return (
    <span className={`ui-sev ui-sev--${s.cls} ${size === 'lg' ? 'ui-sev--lg' : ''}`}>
      <s.Icon size={size === 'lg' ? 16 : 14} aria-hidden="true" />
      {s.label}
      {score != null && <span aria-label={`, risk score ${score} out of 100`}>&nbsp;· {score}/100</span>}
    </span>
  )
}

export function SeverityDot({ severity }) {
  const s = severityUi(severity)
  return <span className={`ui-sevdot ${s ? `ui-sevdot--${s.cls}` : ''}`} aria-hidden="true" />
}

export function Avatar({ name, size = 'md' }) {
  const initial = (String(name || '').trim()[0] || '?').toUpperCase()
  return <span className={`ui-avatar ${size === 'lg' ? 'ui-avatar--lg' : ''}`} aria-hidden="true">{initial}</span>
}

// The single brand lockup. `SankatAI` everywhere; the mark is the brand moment.
export function Brand({ size = 'md', className = '' }) {
  return (
    <span className={`ui-brand ${size === 'sm' ? 'ui-brand--sm' : ''} ${className}`}>
      <HeartPulse size={size === 'sm' ? 20 : 24} aria-hidden="true" />
      SankatAI
    </span>
  )
}
