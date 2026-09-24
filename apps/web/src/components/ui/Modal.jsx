import { useEffect, useId, useRef } from 'react'
import { createPortal } from 'react-dom'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { AnimatePresence, motion } from 'framer-motion'
import { X } from 'lucide-react'
import { IconButton, Button } from './Button.jsx'
import { useFocusTrap, useScrollLock } from './hooks'
import { fade, modalPanel, sidePanel } from './motion'

/**
 * Modal — focus trap, Escape, focus restored on close, scroll lock.
 * Primary action goes last in `footer` (bottom-right). Below 480px it becomes a
 * bottom sheet. `variant="side"` is a right-hand drawer.
 * Pass `onSubmit` to make the body + footer a <form>.
 * While `busy`, Escape / scrim / close are ignored so an in-flight save can't
 * be abandoned half-way.
 */
export function Modal({
  open, onClose, title, description, icon: Icon, iconTone, children, footer, footerStart,
  size = 'sm', variant = 'center', busy = false, onSubmit, initialFocusRef,
}) {
  return createPortal(
    <AnimatePresence>
      {open && (
        <ModalInner
          {...{ onClose, title, description, Icon, iconTone, footer, footerStart, size, variant, busy, onSubmit, initialFocusRef }}
        >
          {children}
        </ModalInner>
      )}
    </AnimatePresence>,
    document.body,
  )
}

function ModalInner({ onClose, title, description, Icon, iconTone, children, footer, footerStart, size, variant, busy, onSubmit, initialFocusRef }) {
  const ref = useRef(null)
  const titleId = useId()
  const descId = useId()
  useFocusTrap(ref, true, { initialFocusRef })
  useScrollLock(true)
  const close = () => { if (!busy) onClose?.() }

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); close() } }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const side = variant === 'side'
  const Body = onSubmit ? 'form' : 'div'
  const bodyProps = onSubmit ? { onSubmit: (e) => { e.preventDefault(); onSubmit(e) }, noValidate: true } : {}

  return (
    <motion.div
      className={`ui-scrim ${side ? 'ui-scrim--side' : ''}`}
      {...fade}
      onMouseDown={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <motion.div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descId : undefined}
        tabIndex={-1}
        className={`ui-modal ${size === 'md' ? 'ui-modal--md' : ''} ${side ? 'ui-modal--side' : ''}`}
        {...(side ? sidePanel : modalPanel)}
      >
        <Body {...bodyProps}>
          <div className="ui-modal-head">
            {Icon && <span className={`ui-modal-icon ${iconTone === 'danger' ? 'ui-modal-icon--danger' : ''}`}><Icon size={18} aria-hidden="true" /></span>}
            <div className="ui-modal-titles">
              <h2 id={titleId} className="ui-modal-title">{title}</h2>
              {description && <p id={descId} className="ui-modal-desc">{description}</p>}
            </div>
            <IconButton label="Close" icon={X} onClick={close} disabled={busy} tooltip={false} className="ui-modal-close" />
          </div>
          {children && <div className="ui-modal-body">{children}</div>}
          {footer && (
            <div className="ui-modal-foot">
              {footerStart && <div className="ui-modal-foot-start">{footerStart}</div>}
              {footer}
            </div>
          )}
        </Body>
      </motion.div>
    </motion.div>
  )
}

// Confirmation for destructive / irreversible actions. Destructive button is
// bottom-right; Cancel sits apart from it and gets initial focus (safe default).
export function ConfirmDialog({
  open, onClose, onConfirm, title, description, confirmLabel = 'Delete', busyLabel = 'Deleting…',
  tone = 'destructive', busy = false, icon, children, confirmDisabled = false,
}) {
  const cancelRef = useRef(null)
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description={description}
      icon={icon}
      iconTone={tone === 'destructive' ? 'danger' : undefined}
      busy={busy}
      onSubmit={() => { if (!busy && !confirmDisabled) onConfirm?.() }}
      initialFocusRef={children ? undefined : cancelRef}
      footer={(
        <>
          <Button ref={cancelRef} variant="secondary" onClick={onClose} disabled={busy}>Cancel</Button>
          <Button type="submit" variant={tone} loading={busy} loadingText={busyLabel} disabled={confirmDisabled}>{confirmLabel}</Button>
        </>
      )}
    >
      {children}
    </Modal>
  )
}
