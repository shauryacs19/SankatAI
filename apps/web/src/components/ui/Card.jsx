// Card — the one container. Border, no shadow, no nested boxes: use
// `.ui-rows` for separated rows inside a card.
export function Card({ as = 'section', title, icon: Icon, description, actions, headingLevel = 2, flush = false, className = '', children, ...rest }) {
  const H = `h${headingLevel}`
  const Tag = as
  return (
    <Tag className={`ui-card ${flush ? 'ui-card--flush' : ''} ${className}`} {...rest}>
      {(title || actions) && (
        <div className="ui-card-head">
          {title && <H className="ui-card-title">{Icon && <Icon size={18} aria-hidden="true" />}{title}</H>}
          {actions && <div className="ui-card-actions">{actions}</div>}
        </div>
      )}
      {description && <p className="ui-card-desc">{description}</p>}
      {children}
    </Tag>
  )
}

// Page intro: optional title (standalone pages use h1; dashboard pages get
// their h1 from the app bar), one line of context, and the page-level actions
// top-right.
export function PageHeader({ title, description, actions, headingLevel = 1 }) {
  const H = `h${headingLevel}`
  return (
    <div className="ui-pagehead">
      <div className="ui-pagehead-text">
        {title && <H className="ui-pagehead-title">{title}</H>}
        {description && <p className="ui-pagehead-desc">{description}</p>}
      </div>
      {actions && <div className="ui-pagehead-actions">{actions}</div>}
    </div>
  )
}

export function SkipLink({ target = '#main' }) {
  return <a className="ui-skip" href={target}>Skip to main content</a>
}
