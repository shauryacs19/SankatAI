import { AlertTriangle, CheckCircle2, Info, RotateCw } from 'lucide-react'
import { Button } from './Button.jsx'

// Placeholder shaped like the content it stands in for (initial loads only).
export function Skeleton({ width, height = '1rem', variant, className = '', style }) {
  const cls = `ui-skel ${variant === 'text' ? 'ui-skel--text' : ''} ${variant === 'circle' ? 'ui-skel--circle' : ''} ${className}`
  return <span className={cls} style={{ width, height: variant === 'text' ? undefined : height, ...style }} aria-hidden="true" />
}

// Says what goes here and offers the action that fills it.
export function EmptyState({ icon: Icon, title, description, action, compact = false, headingLevel = 2 }) {
  const H = `h${headingLevel}`
  return (
    <div className={`ui-state ${compact ? 'ui-state--compact' : ''}`}>
      {Icon && <span className="ui-state-icon"><Icon size={20} aria-hidden="true" /></span>}
      <H className="ui-state-title">{title}</H>
      {description && <p className="ui-state-desc">{description}</p>}
      {action && <div className="ui-state-actions">{action}</div>}
    </div>
  )
}

// Says what failed, in plain words, with a retry.
export function ErrorState({ title = 'Something went wrong', description, onRetry, retrying = false, retryLabel = 'Try again', compact = false, headingLevel = 2 }) {
  const H = `h${headingLevel}`
  return (
    <div className={`ui-state ui-state--error ${compact ? 'ui-state--compact' : ''}`} role="alert">
      <span className="ui-state-icon"><AlertTriangle size={20} aria-hidden="true" /></span>
      <H className="ui-state-title">{title}</H>
      {description && <p className="ui-state-desc">{description}</p>}
      {onRetry && (
        <div className="ui-state-actions">
          <Button variant="secondary" icon={RotateCw} onClick={onRetry} loading={retrying} loadingText="Retrying…">{retryLabel}</Button>
        </div>
      )}
    </div>
  )
}

const ALERT_ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, danger: AlertTriangle }

// Inline notice. danger/warning are announced immediately; info/success politely.
export function Alert({ tone = 'info', title, children, action, icon, className = '' }) {
  const Icon = icon || ALERT_ICONS[tone]
  return (
    <div className={`ui-alert ui-alert--${tone} ${className}`} role={tone === 'danger' || tone === 'warning' ? 'alert' : 'status'}>
      <Icon size={16} aria-hidden="true" />
      <div className="ui-alert-body">
        {title && <p className="ui-alert-title">{title}</p>}
        {children && <div>{children}</div>}
      </div>
      {action && <div className="ui-alert-action">{action}</div>}
    </div>
  )
}
