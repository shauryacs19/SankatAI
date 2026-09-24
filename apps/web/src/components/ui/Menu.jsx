import { useEffect, useId, useRef, useState } from 'react'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { AnimatePresence, motion } from 'framer-motion'
import { IconButton } from './Button.jsx'
import { dropdown } from './motion'

/**
 * Menu — a dropdown of actions. Arrow keys move, Enter/Space selects, Escape
 * or an outside click closes and returns focus to the trigger.
 * items: [{ key, label, icon, onSelect, tone: 'danger' }]
 */
export function Menu({ label, icon, items, placement = 'bottom', align = 'end', triggerClassName = '', tooltip = true }) {
  const [open, setOpen] = useState(false)
  const anchorRef = useRef(null)
  const triggerRef = useRef(null)
  const listRef = useRef(null)
  const menuId = useId()

  const itemsEls = () => Array.from(listRef.current?.querySelectorAll('[role="menuitem"]') || [])
  const close = (refocus = true) => { setOpen(false); if (refocus) triggerRef.current?.focus() }

  useEffect(() => {
    if (!open) return undefined
    requestAnimationFrame(() => itemsEls()[0]?.focus())
    const onDown = (e) => { if (!anchorRef.current?.contains(e.target)) setOpen(false) }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [open])

  const onKeyDown = (e) => {
    const els = itemsEls()
    const i = els.indexOf(document.activeElement)
    if (e.key === 'ArrowDown') { e.preventDefault(); els[(i + 1) % els.length]?.focus() }
    else if (e.key === 'ArrowUp') { e.preventDefault(); els[(i - 1 + els.length) % els.length]?.focus() }
    else if (e.key === 'Home') { e.preventDefault(); els[0]?.focus() }
    else if (e.key === 'End') { e.preventDefault(); els[els.length - 1]?.focus() }
    else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close() }
    else if (e.key === 'Tab') setOpen(false)
  }

  return (
    <span className="ui-menu-anchor" ref={anchorRef}>
      <IconButton
        ref={triggerRef}
        label={label}
        icon={icon}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        className={triggerClassName}
        tooltip={tooltip && !open}
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o) }}
      />
      <AnimatePresence>
        {open && (
          <motion.div
            ref={listRef}
            id={menuId}
            role="menu"
            aria-label={label}
            className={`ui-menu ui-menu--${placement} ui-menu--${align}`}
            onKeyDown={onKeyDown}
            {...dropdown}
          >
            {items.map((it) => (
              <button
                key={it.key || it.label}
                type="button"
                role="menuitem"
                tabIndex={-1}
                className={`ui-menu-item ${it.tone === 'danger' ? 'ui-menu-item--danger' : ''}`}
                onClick={(e) => { e.stopPropagation(); close(!it.keepFocus); it.onSelect?.() }}
              >
                {it.icon && <it.icon size={16} aria-hidden="true" />}{it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </span>
  )
}
