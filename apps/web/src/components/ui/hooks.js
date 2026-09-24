import { useEffect, useRef, useState } from 'react'

// True only once `flag` has stayed true for `delay` ms — so fast responses
// never flash a loader.
export function useDelayedFlag(flag, delay = 300) {
  const [shown, setShown] = useState(false)
  useEffect(() => {
    if (!flag) return undefined
    const t = setTimeout(() => setShown(true), delay)
    return () => { clearTimeout(t); setShown(false) }
  }, [flag, delay])
  return flag && shown
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'

export const focusables = (root) =>
  Array.from(root?.querySelectorAll(FOCUSABLE) || []).filter((el) => !el.closest('[aria-hidden="true"]') && el.getClientRects().length > 0)

// Traps Tab inside `ref` while `active`; moves focus in on open and restores it
// to whatever had focus before on close.
export function useFocusTrap(ref, active, { initialFocusRef } = {}) {
  const restoreRef = useRef(null)
  useEffect(() => {
    if (!active) return undefined
    restoreRef.current = document.activeElement
    const root = ref.current
    const frame = requestAnimationFrame(() => {
      if (!root) return
      if (root.contains(document.activeElement)) return // autoFocus already placed it
      const target = initialFocusRef?.current || root.querySelector('[data-autofocus]') || focusables(root)[0] || root
      target.focus({ preventScroll: true })
    })
    const onKey = (e) => {
      if (e.key !== 'Tab' || !root) return
      const items = focusables(root)
      if (!items.length) { e.preventDefault(); root.focus(); return }
      const first = items[0]
      const last = items[items.length - 1]
      if (e.shiftKey && (document.activeElement === first || !root.contains(document.activeElement))) { e.preventDefault(); last.focus() }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      cancelAnimationFrame(frame)
      document.removeEventListener('keydown', onKey)
      const prev = restoreRef.current
      if (prev && typeof prev.focus === 'function' && document.contains(prev)) prev.focus({ preventScroll: true })
    }
  }, [active, ref, initialFocusRef])
}

// Locks page scroll while an overlay is open.
export function useScrollLock(active) {
  useEffect(() => {
    if (!active) return undefined
    const { overflow } = document.body.style
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = overflow }
  }, [active])
}

// Arrow-key roving focus for radio/tab groups.
export const rovingKeyDown = (e, values, value, onChange) => {
  const i = values.indexOf(value)
  let next = null
  if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = values[(i + 1) % values.length]
  else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = values[(i - 1 + values.length) % values.length]
  else if (e.key === 'Home') next = values[0]
  else if (e.key === 'End') next = values[values.length - 1]
  if (next == null) return
  e.preventDefault()
  onChange(next)
  const group = e.currentTarget.closest('[role="radiogroup"], [role="tablist"]')
  requestAnimationFrame(() => group?.querySelector(`[data-value="${CSS.escape(String(next))}"]`)?.focus())
}
