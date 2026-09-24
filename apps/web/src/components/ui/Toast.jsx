import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { ToastContext } from './toastContext'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { AnimatePresence, motion } from 'framer-motion'
import { AlertTriangle, CheckCircle2, Info, X } from 'lucide-react'
import { IconButton } from './Button.jsx'
import { toastMotion } from './motion'

const ICONS = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: AlertTriangle }
const DURATION = { info: 5000, success: 4000, warning: 7000, error: 7000 }

/**
 * App-wide toasts. `useToast().error('Could not rename the chat.')`.
 * Announced politely (errors assertively), auto-dismissed, paused while the
 * pointer or keyboard focus is on the toast.
 */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])
  const seq = useRef(0)

  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), [])
  const push = useCallback((tone, message, opts = {}) => {
    const id = ++seq.current
    setToasts((t) => [...t.filter((x) => x.message !== message), { id, tone, message, title: opts.title }].slice(-3))
    return id
  }, [])

  const api = useMemo(() => ({
    info: (m, o) => push('info', m, o),
    success: (m, o) => push('success', m, o),
    warning: (m, o) => push('warning', m, o),
    error: (m, o) => push('error', m, o),
    dismiss,
  }), [push, dismiss])

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="ui-toasts" role="region" aria-label="Notifications">
        <AnimatePresence initial={false}>
          {toasts.map((t) => <ToastItem key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />)}
        </AnimatePresence>
      </div>
    </ToastContext.Provider>
  )
}

function ToastItem({ toast, onDismiss }) {
  const [paused, setPaused] = useState(false)
  const remaining = useRef(DURATION[toast.tone])
  const started = useRef(0)

  useEffect(() => {
    if (paused) return undefined
    started.current = Date.now()
    const t = setTimeout(onDismiss, remaining.current)
    return () => { clearTimeout(t); remaining.current -= Date.now() - started.current }
  }, [paused, onDismiss])

  const Icon = ICONS[toast.tone] || Info
  return (
    <motion.div
      layout="position"
      className={`ui-toast ui-toast--${toast.tone}`}
      role={toast.tone === 'error' ? 'alert' : 'status'}
      aria-live={toast.tone === 'error' ? 'assertive' : 'polite'}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      {...toastMotion}
    >
      <Icon size={18} className="ui-toast-icon" aria-hidden="true" />
      <div className="ui-toast-body">
        {toast.title && <p className="ui-toast-title">{toast.title}</p>}
        <p>{toast.message}</p>
      </div>
      <IconButton label="Dismiss notification" icon={X} size={16} onClick={onDismiss} tooltip={false} />
    </motion.div>
  )
}
