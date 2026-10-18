// Shared shell + controls for the sign-in, sign-up, verify and reset pages.
import { forwardRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Check, Eye, EyeOff, MessageSquareText, Phone, X } from 'lucide-react'
import { Brand, Button, SkipLink } from '../../../components/ui'
import { PASSWORD_RULES } from '../../../services/auth/authErrors'
import { hasStashedGuestChat } from '../../chat/guestChat'
import { AUTH_CSS } from './auth.styles'

export function AuthLayout({ title, lead, children, footer }) {
  // A guest chat the person chose to save waits in this tab until the chat opens.
  const [pending] = useState(hasStashedGuestChat)
  return (
    <div className="auth">
      <style>{AUTH_CSS}</style>
      <SkipLink />
      <header className="auth-bar">
        <Link to="/" className="auth-home" aria-label="SankatAI home"><Brand /></Link>
        <Button variant="emergency" size="sm" icon={Phone} href="tel:108" aria-label="Emergency — call 108">Call 108</Button>
      </header>
      <main id="main" tabIndex={-1} className="auth-main">
        <div className="auth-card">
          <div className="auth-head">
            <h1 className="auth-title">{title}</h1>
            {lead && <p className="auth-lead">{lead}</p>}
          </div>
          {pending && (
            <p className="auth-pending">
              <MessageSquareText size={18} aria-hidden="true" />
              <span>Your guest conversation will be saved to your account as soon as you are signed in.</span>
            </p>
          )}
          <div className="auth-panel">{children}</div>
          {footer && <div className="auth-links">{footer}</div>}
        </div>
        <p className="auth-foot">
          SankatAI gives guidance, not a diagnosis. In an emergency, <a className="link link--emergency" href="tel:108">call 108</a>.
        </p>
      </main>
    </div>
  )
}

/** Password input with a show/hide toggle. Props pass through to <input>. */
export const PasswordInput = forwardRef(function PasswordInput({ className = '', ...rest }, ref) {
  const [shown, setShown] = useState(false)
  return (
    <span className="ui-inputgroup auth-pw">
      <input ref={ref} type={shown ? 'text' : 'password'} className={`ui-input has-end ${className}`} {...rest} />
      <span className="ui-inputgroup-end">
        <button
          type="button"
          className="auth-pw-toggle"
          aria-label={shown ? 'Hide password' : 'Show password'}
          aria-pressed={shown}
          onClick={() => setShown((s) => !s)}
        >
          {shown ? <EyeOff size={18} aria-hidden="true" /> : <Eye size={18} aria-hidden="true" />}
        </button>
      </span>
    </span>
  )
})

/** Live checklist mirroring the Cognito password policy. */
export function PasswordChecklist({ password, id }) {
  return (
    <ul className="auth-rules" id={id} aria-label="Password requirements">
      {PASSWORD_RULES.map((r) => {
        const ok = r.test(password)
        return (
          <li key={r.id} className={ok ? 'ok' : ''}>
            {ok ? <Check size={16} aria-hidden="true" /> : <X size={16} aria-hidden="true" />}
            <span>{r.label}</span>
            <span className="sr-only">{ok ? ' (met)' : ' (not met)'}</span>
          </li>
        )
      })}
    </ul>
  )
}

/** 6-digit numeric code input. */
export const CodeInput = forwardRef(function CodeInput({ value, onChange, ...rest }, ref) {
  return (
    <input
      ref={ref}
      className="ui-input auth-code"
      inputMode="numeric"
      autoComplete="one-time-code"
      maxLength={6}
      value={value}
      onChange={(e) => onChange(e.target.value.replace(/\D/g, '').slice(0, 6))}
      {...rest}
    />
  )
})
