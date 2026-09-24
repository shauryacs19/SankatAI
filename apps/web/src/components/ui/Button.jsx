import { forwardRef, useId } from 'react'

// Inline activity indicator. Only for in-place actions — initial page loads use
// <Skeleton>. Decorative: the status text lives on the control.
export function Spinner({ size = 16, className = '' }) {
  return (
    <svg className={`ui-spinner ${className}`} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  )
}

// Supplementary hover/focus label. Never the only way to learn something.
export function Tooltip({ label, side = 'top', align = 'center', children }) {
  if (!label) return children
  return (
    <span className="ui-tipwrap">
      {children}
      <span className={`ui-tip ${side === 'bottom' ? 'ui-tip--bottom' : ''} ${align === 'end' ? 'ui-tip--end' : ''}`} aria-hidden="true">{label}</span>
    </span>
  )
}

/**
 * Button — primary (one per view) · secondary · ghost · destructive · emergency.
 * `loading` keeps the width (both labels share one grid cell) and sets
 * aria-busy; `loadingText` is the contextual copy ("Saving your details…").
 * A disabled button with a `hint` stays focusable (aria-disabled) so keyboard
 * and pointer users can both learn WHY it's disabled.
 */
export const Button = forwardRef(function Button(
  { variant = 'secondary', size = 'md', block = false, loading = false, loadingText, icon: Icon, iconEnd: IconEnd,
    hint, disabled = false, href, type = 'button', className = '', children, onClick, ...rest },
  ref,
) {
  const hintId = useId()
  const softDisabled = disabled && Boolean(hint)
  const cls = `ui-btn ui-btn--${variant} ${size === 'sm' ? 'ui-btn--sm' : ''} ${block ? 'ui-btn--block' : ''} ${className}`
  const iconSize = size === 'sm' ? 16 : 18
  const content = (
    <span className="ui-btn-stack">
      <span className="ui-btn-idle">{Icon && <Icon size={iconSize} aria-hidden="true" />}{children}{IconEnd && <IconEnd size={iconSize} aria-hidden="true" />}</span>
      <span className="ui-btn-busy" aria-hidden={!loading}><Spinner size={iconSize} />{loadingText || children}</span>
    </span>
  )

  if (href) {
    return <a ref={ref} href={href} className={cls} onClick={onClick} {...rest}>{content}</a>
  }

  const btn = (
    <button
      ref={ref}
      type={softDisabled ? 'button' : type}
      className={cls}
      disabled={(disabled && !softDisabled) || undefined}
      aria-disabled={softDisabled || undefined}
      aria-busy={loading || undefined}
      aria-describedby={softDisabled ? hintId : undefined}
      onClick={(e) => { if (softDisabled || loading) { e.preventDefault(); return } onClick?.(e) }}
      {...rest}
    >
      {content}
    </button>
  )
  if (!softDisabled) return btn
  return (
    <Tooltip label={hint}>
      {btn}
      <span id={hintId} className="sr-only">{hint}</span>
    </Tooltip>
  )
})

/**
 * IconButton — compact control. `label` is REQUIRED: it becomes the
 * aria-label and the tooltip. Hit area ≥40px (44px on touch).
 */
export const IconButton = forwardRef(function IconButton(
  { label, icon: Icon, variant = 'ghost', size = 18, href, tooltip = true, tooltipSide = 'top', tooltipAlign, className = '', type = 'button', children, ...rest },
  ref,
) {
  const cls = `ui-iconbtn ${variant !== 'ghost' ? `ui-iconbtn--${variant}` : ''} ${className}`
  const inner = children || (Icon && <Icon size={size} aria-hidden="true" />)
  const el = href
    ? <a ref={ref} href={href} className={cls} aria-label={label} {...rest}>{inner}</a>
    : <button ref={ref} type={type} className={cls} aria-label={label} {...rest}>{inner}</button>
  return tooltip ? <Tooltip label={label} side={tooltipSide} align={tooltipAlign}>{el}</Tooltip> : el
})
