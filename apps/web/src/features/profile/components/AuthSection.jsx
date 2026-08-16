// Authentication section — account details, password change and sign out.
// Rendered inside the Settings tab (not a tab of its own). Password changes go
// straight to Cognito from the client.

import { useState } from 'react'
import { KeyRound, Mail, ShieldCheck, LogOut, Check, AlertTriangle, Lock } from 'lucide-react'
import { changePassword } from '../../../services/auth/cognito'
import { useAuth } from '../../../context/AuthContext.jsx'

const MIN_LEN = 8

export default function AuthSection({ profile, onSignOut }) {
  const { user } = useAuth() || {}
  const email = profile?.email || user?.email || ''

  const [current, setCurrent] = useState('')
  const [next, setNext] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [done, setDone] = useState(false)

  const tooShort = next.length > 0 && next.length < MIN_LEN
  const mismatch = confirm.length > 0 && next !== confirm
  const canSave = Boolean(email) && current && next.length >= MIN_LEN && next === confirm && !busy

  const submit = async (e) => {
    e.preventDefault()
    if (!canSave) return
    setBusy(true); setError(''); setDone(false)
    try {
      await changePassword(email, current, next)
      setCurrent(''); setNext(''); setConfirm(''); setDone(true)
    } catch (err) {
      setError(err.message || 'Could not change your password.')
    } finally { setBusy(false) }
  }

  return (
    <>
        <section className="dx-card">
          <div className="dx-card-title"><ShieldCheck size={15} /> Account</div>
          <div className="info-row"><span className="info-row-label"><Mail size={13} /> Email</span><span className="info-row-value">{email || '—'}</span></div>
          <div className="info-row"><span className="info-row-label"><Lock size={13} /> Sign-in method</span><span className="info-row-value">Email &amp; password</span></div>
          <p className="da-note">Your password is managed by AWS Cognito. SankatAI never stores it.</p>
        </section>

        <section className="dx-card">
          <div className="dx-card-title"><KeyRound size={15} /> Change password</div>
          <form className="da-form" onSubmit={submit}>
            <label className="da-field">
              <span className="da-label">Current password</span>
              <input className="da-input" type="password" autoComplete="current-password" value={current} onChange={(e) => { setCurrent(e.target.value); setError(''); setDone(false) }} placeholder="Enter your current password" />
            </label>
            <label className="da-field">
              <span className="da-label">New password</span>
              <input className={`da-input ${tooShort ? 'invalid' : ''}`} type="password" autoComplete="new-password" value={next} onChange={(e) => { setNext(e.target.value); setError(''); setDone(false) }} placeholder={`At least ${MIN_LEN} characters`} />
              {tooShort && <span className="da-err">Use at least {MIN_LEN} characters.</span>}
            </label>
            <label className="da-field">
              <span className="da-label">Confirm new password</span>
              <input className={`da-input ${mismatch ? 'invalid' : ''}`} type="password" autoComplete="new-password" value={confirm} onChange={(e) => { setConfirm(e.target.value); setError(''); setDone(false) }} placeholder="Re-enter the new password" />
              {mismatch && <span className="da-err">Passwords do not match.</span>}
            </label>

            {error && <p className="da-alert error"><AlertTriangle size={14} /> {error}</p>}
            {done && <p className="da-alert ok"><Check size={14} /> Password updated.</p>}

            <div className="da-actions">
              <button type="submit" className="dx-action danger" disabled={!canSave}>{busy ? 'Updating…' : 'Update password'}</button>
            </div>
          </form>
        </section>

        <section className="dx-card">
          <div className="dx-card-title"><LogOut size={15} /> Session</div>
          <p className="da-note">Signing out clears this device's session. Your data stays in your account.</p>
          <button type="button" className="dx-setting-btn danger" onClick={onSignOut}><LogOut size={16} /> Sign out</button>
        </section>
    </>
  )
}
