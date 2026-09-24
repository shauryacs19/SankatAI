import { useId } from 'react'
import { rovingKeyDown } from './hooks'

/**
 * SegmentedControl — single choice among 2–4 options (radiogroup semantics,
 * arrow keys move and select). options: [{ value, label, icon, hideLabel }]
 */
export function SegmentedControl({ label, options, value, onChange, block = false }) {
  const values = options.map((o) => o.value)
  return (
    <div role="radiogroup" aria-label={label} className={`ui-seg ${block ? 'ui-seg--block' : ''}`}>
      {options.map((o) => {
        const checked = o.value === value
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={checked}
            aria-label={o.hideLabel ? o.label : undefined}
            title={o.hideLabel ? o.label : undefined}
            tabIndex={checked ? 0 : -1}
            data-value={o.value}
            className="ui-seg-item"
            onClick={() => onChange(o.value)}
            onKeyDown={(e) => rovingKeyDown(e, values, value, onChange)}
          >
            {o.icon && <o.icon size={16} aria-hidden="true" />}
            {!o.hideLabel && o.label}
          </button>
        )
      })}
    </div>
  )
}

/**
 * Tabs — the tab list only; the caller renders the panel with
 * id={`${idBase}-panel`} role="tabpanel" aria-labelledby={`${idBase}-${value}`}.
 */
export function Tabs({ label, tabs, value, onChange, idBase, block = true }) {
  const values = tabs.map((t) => t.value)
  return (
    <div role="tablist" aria-label={label} className={`ui-seg ${block ? 'ui-seg--block' : ''}`}>
      {tabs.map((t) => {
        const selected = t.value === value
        return (
          <button
            key={t.value}
            id={`${idBase}-${t.value}`}
            type="button"
            role="tab"
            aria-selected={selected}
            aria-controls={`${idBase}-panel`}
            tabIndex={selected ? 0 : -1}
            data-value={t.value}
            className="ui-seg-item"
            onClick={() => onChange(t.value)}
            onKeyDown={(e) => rovingKeyDown(e, values, value, onChange)}
          >
            {t.label}
          </button>
        )
      })}
    </div>
  )
}

// Switch with a visible, bound label (and optional description).
export function Switch({ checked, onChange, label, description, disabled = false }) {
  const id = useId()
  return (
    <div className="ui-switch-row">
      <div className="ui-switch-text">
        <span id={`${id}-l`} className="ui-label">{label}</span>
        {description && <span id={`${id}-d`} className="ui-switch-desc">{description}</span>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-labelledby={`${id}-l`}
        aria-describedby={description ? `${id}-d` : undefined}
        disabled={disabled}
        className="ui-switch"
        onClick={() => onChange(!checked)}
      >
        <span className="ui-switch-track"><span className="ui-switch-thumb" /></span>
      </button>
    </div>
  )
}
