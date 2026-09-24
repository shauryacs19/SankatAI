import { Children, cloneElement, forwardRef, isValidElement, useId } from 'react'
import { AlertCircle, ChevronDown } from 'lucide-react'

/**
 * Field — label + control + hint + error. The label is always bound to the
 * control; errors set aria-invalid + aria-describedby. `required` is announced
 * via aria-required (forms use noValidate, so no browser bubbles).
 */
export function Field({ label, hint, error, required = false, optional = false, id, className = '', children }) {
  const autoId = useId()
  const fid = id || `f${autoId.replace(/:/g, '')}`
  const hintId = hint ? `${fid}-hint` : undefined
  const errId = error ? `${fid}-err` : undefined
  const describedBy = [hintId, errId].filter(Boolean).join(' ') || undefined
  const child = Children.only(children)
  const control = isValidElement(child)
    ? cloneElement(child, {
      id: fid,
      'aria-invalid': error ? true : undefined,
      'aria-describedby': [child.props['aria-describedby'], describedBy].filter(Boolean).join(' ') || undefined,
      'aria-required': required || undefined,
    })
    : child
  return (
    <div className={`ui-field ${className}`}>
      <label htmlFor={fid} className="ui-label">
        {label}
        {required && <span className="ui-req" aria-hidden="true">*</span>}
        {optional && <span className="ui-label-opt"> (optional)</span>}
      </label>
      {control}
      {hint && <p id={hintId} className="ui-hint">{hint}</p>}
      {error && <p id={errId} className="ui-field-error"><AlertCircle size={14} aria-hidden="true" />{error}</p>}
    </div>
  )
}

export const Input = forwardRef(function Input({ className = '', type = 'text', ...rest }, ref) {
  return <input ref={ref} type={type} className={`ui-input ${className}`} {...rest} />
})

// 6-digit PIN entry (numeric keypad on mobile, never shown in clear).
export const PinInput = forwardRef(function PinInput({ value, onChange, className = '', ...rest }, ref) {
  return (
    <input
      ref={ref}
      type="password"
      inputMode="numeric"
      autoComplete="off"
      maxLength={6}
      placeholder="••••••"
      className={`ui-input ui-input--pin ${className}`}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      {...rest}
    />
  )
})

export const Textarea = forwardRef(function Textarea({ className = '', rows = 3, ...rest }, ref) {
  return <textarea ref={ref} rows={rows} className={`ui-textarea ${className}`} {...rest} />
})

export const Select = forwardRef(function Select({ className = '', children, ...rest }, ref) {
  return (
    <span className="ui-select-wrap">
      <select ref={ref} className={`ui-select ${className}`} {...rest}>{children}</select>
      <ChevronDown size={16} className="ui-select-chev" aria-hidden="true" />
    </span>
  )
})

// Input with a leading icon and an optional trailing slot (clear button, spinner).
export const IconInput = forwardRef(function IconInput({ icon: Icon, end, className = '', ...rest }, ref) {
  return (
    <span className="ui-inputgroup">
      {Icon && <Icon size={16} aria-hidden="true" />}
      <input ref={ref} className={`ui-input ${end ? 'has-end' : ''} ${className}`} {...rest} />
      {end && <span className="ui-inputgroup-end">{end}</span>}
    </span>
  )
})
