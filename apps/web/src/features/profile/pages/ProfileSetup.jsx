import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, HeartPulse, Phone, ArrowLeft, ArrowRight, Check, Plus, Trash2,
  Droplet, HeartPulse as Vitals, Languages, AlertTriangle, Accessibility, AlertCircle,
} from 'lucide-react'
import { saveProfile } from '../services/profileApi'
import { useAuth } from '../../../context/AuthContext.jsx'
import { useProfile } from '../context/ProfileContext.jsx'

const GENDERS = ['Male', 'Female', 'Non-binary', 'Other', 'Prefer not to say']
const BLOOD_GROUPS = ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-', 'Unknown']
const LANGUAGES = ['English', 'Hindi', 'Bengali', 'Tamil', 'Telugu', 'Marathi', 'Gujarati', 'Kannada', 'Malayalam', 'Punjabi', 'Urdu', 'Other']

const emptyContact = { name: '', relationship: '', phone: '' }

const STEPS = [
  { key: 'personal', label: 'Personal details', Icon: User },
  { key: 'medical', label: 'Medical information', Icon: HeartPulse },
  { key: 'contacts', label: 'Emergency contacts', Icon: Phone },
]

// Required fields per step (must be filled before leaving that step).
const REQUIRED = {
  0: ['firstName', 'dob', 'gender', 'phone', 'email'],
  1: ['bloodGroup'],
  2: [],
}
const LABELS = {
  firstName: 'First name', dob: 'Date of birth', gender: 'Gender',
  phone: 'Phone number', email: 'Email', bloodGroup: 'Blood group',
}

// All required fields across steps — completion % is measured only on these.
const REQUIRED_FIELDS = Object.values(REQUIRED).flat()

const makeInitial = (existing, email) => ({
  firstName: '', middleName: '', lastName: '', dob: '', gender: '',
  bloodGroup: '', phone: '', email: email || '',
  emergencyContacts: [{ ...emptyContact }],
  allergies: '', conditions: '', disability: '', preferredLanguage: 'English',
  ...(existing || {}),
  ...(existing && existing.emergencyContacts?.length ? { emergencyContacts: existing.emergencyContacts } : {}),
})

const ageFromDob = (dob) => {
  if (!dob) return null
  const born = new Date(dob)
  if (Number.isNaN(born.getTime())) return null
  const now = new Date()
  let age = now.getFullYear() - born.getFullYear()
  const m = now.getMonth() - born.getMonth()
  if (m < 0 || (m === 0 && now.getDate() < born.getDate())) age--
  return age >= 0 ? age : null
}

function ProfileSetup() {
  const navigate = useNavigate()
  const { profile: existing, setProfile } = useProfile()
  const { user } = useAuth()
  const [form, setForm] = useState(() => makeInitial(existing, user?.email))
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')
  const [errors, setErrors] = useState({})     // { fieldKey: true }
  const fieldRefs = useRef({})                  // fieldKey -> DOM node

  const age = useMemo(() => ageFromDob(form.dob), [form.dob])
  const isEditing = Boolean(existing)
  const isLast = step === STEPS.length - 1

  // Completion is measured only against the required fields (optionals ignored).
  const completion = useMemo(() => {
    const filled = REQUIRED_FIELDS.filter((f) => String(form[f] || '').trim()).length
    return Math.round((filled / REQUIRED_FIELDS.length) * 100)
  }, [form])

  const set = (field) => (e) => {
    const value = e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field]) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n })
    if (serverError) setServerError('')
  }
  const setContact = (index, field) => (e) => {
    const value = e.target.value
    setForm((prev) => ({
      ...prev,
      emergencyContacts: prev.emergencyContacts.map((c, i) => (i === index ? { ...c, [field]: value } : c)),
    }))
  }
  const addContact = () => setForm((prev) =>
    prev.emergencyContacts.length >= 3 ? prev : { ...prev, emergencyContacts: [...prev.emergencyContacts, { ...emptyContact }] })
  const removeContact = (index) => setForm((prev) => ({
    ...prev,
    emergencyContacts: prev.emergencyContacts.filter((_, i) => i !== index),
  }))

  // Which required fields on the current step are still empty.
  const missingOnStep = (s) => REQUIRED[s].filter((f) => !String(form[f] || '').trim())

  // Validate the current step; on failure, flag fields + scroll to the first one.
  const validateAndProceed = (proceed) => {
    const missing = missingOnStep(step)
    if (missing.length) {
      const flagged = {}
      missing.forEach((f) => { flagged[f] = true })
      setErrors(flagged)
      setServerError(`Please fill the required field${missing.length > 1 ? 's' : ''}: ${missing.map((f) => LABELS[f]).join(', ')}.`)
      const el = fieldRefs.current[missing[0]]
      if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); setTimeout(() => el.focus?.(), 250) }
      return
    }
    setErrors({})
    setServerError('')
    proceed()
  }

  // Continue: advance to the next tab, gated on the current tab's required
  // fields. On the last tab it saves.
  const advance = () => validateAndProceed(() => (step < STEPS.length - 1 ? setStep(step + 1) : finish()))

  const stepForField = (f) => {
    const s = Object.keys(REQUIRED).find((k) => REQUIRED[k].includes(f))
    return s != null ? Number(s) : 0
  }

  // Skip: jump straight to finishing (skip the remaining optional tabs) — but
  // only if EVERY required field is filled. Otherwise, flag the missing ones
  // and take the user to the first one (switching tabs if needed).
  const skipToFinish = () => {
    const missing = REQUIRED_FIELDS.filter((f) => !String(form[f] || '').trim())
    if (missing.length) {
      const flagged = {}
      missing.forEach((f) => { flagged[f] = true })
      setErrors(flagged)
      setServerError(`Please fill the required field${missing.length > 1 ? 's' : ''}: ${missing.map((f) => LABELS[f]).join(', ')}.`)
      const first = missing[0]
      setStep(stepForField(first))
      setTimeout(() => {
        const el = fieldRefs.current[first]
        if (el) { el.scrollIntoView({ behavior: 'smooth', block: 'center' }); el.focus?.() }
      }, 350)
      return
    }
    setErrors({})
    setServerError('')
    finish()
  }

  const back = () => { setErrors({}); setServerError(''); setStep((s) => Math.max(0, s - 1)) }
  const gotoStep = (i) => { if (i < step) { setErrors({}); setServerError(''); setStep(i) } }  // only go back freely

  const finish = async () => {
    setServerError('')
    const cleaned = {
      ...form,
      emergencyContacts: form.emergencyContacts.filter((c) => c.name.trim() || c.phone.trim()),
    }
    setSaving(true)
    try {
      const saved = await saveProfile(cleaned)
      setProfile(saved)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setServerError(err.message || 'Could not save your profile. Please try again.')
    } finally {
      setSaving(false)
    }
  }

  const reg = (key) => (el) => { fieldRefs.current[key] = el }

  return (
    <div className="ps">
      <style>{PS_CSS}</style>

      <div className="ps-card">
        <div className="ps-brand"><HeartPulse size={20} /> Sankat<span>.AI</span></div>
        <h1 className="ps-title">{isEditing ? 'Edit your profile' : 'Finish setting up your profile'}</h1>
        <p className="ps-sub">This helps Sankat.AI give safer, more personalised triage. Fields marked <span className="ps-req">*</span> are required.</p>

        <div className="ps-completion">
          <div className="ps-completion-top"><span>Profile completion</span><span>{completion}%</span></div>
          <div className="ps-bar"><motion.div className="ps-bar-fill" animate={{ width: `${completion}%` }} transition={{ duration: 0.4 }} /></div>
        </div>

        <div className="ps-stepper">
          {STEPS.map((s, i) => (
            <button key={s.key} className={`ps-step ${i === step ? 'active' : ''} ${i < step ? 'done' : ''} ${i > step ? 'locked' : ''}`} onClick={() => gotoStep(i)}>
              <span className="ps-step-dot">{i < step ? <Check size={14} /> : <s.Icon size={15} />}</span>
              <span className="ps-step-label">{s.label}</span>
            </button>
          ))}
        </div>

        {serverError && <div className="ps-error"><AlertCircle size={16} /> {serverError}</div>}

        <div className="ps-body">
          <AnimatePresence mode="wait">
            {step === 0 && (
              <motion.div key="personal" className="ps-fields" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                <div className="ps-grid">
                  <Field label="First name" required error={errors.firstName}>
                    <input ref={reg('firstName')} value={form.firstName} onChange={set('firstName')} placeholder="First name" />
                  </Field>
                  <Field label="Middle name"><input value={form.middleName} onChange={set('middleName')} placeholder="Optional" /></Field>
                  <Field label="Last name"><input value={form.lastName} onChange={set('lastName')} placeholder="Last name" /></Field>
                  <Field label="Date of birth" required error={errors.dob} hint={age != null ? `Age: ${age} years` : null}>
                    <input ref={reg('dob')} type="date" value={form.dob} onChange={set('dob')} max={new Date().toISOString().slice(0, 10)} />
                  </Field>
                  <Field label="Gender" required error={errors.gender}>
                    <select ref={reg('gender')} value={form.gender} onChange={set('gender')}>
                      <option value="">Select…</option>{GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                    </select>
                  </Field>
                  <Field label="Phone number" required error={errors.phone}>
                    <input ref={reg('phone')} type="tel" value={form.phone} onChange={set('phone')} placeholder="e.g. +91 98765 43210" />
                  </Field>
                  <Field label="Email" required error={errors.email}>
                    <input ref={reg('email')} type="email" value={form.email} onChange={set('email')} placeholder="you@example.com" />
                  </Field>
                  <Field label="Preferred language">
                    <select value={form.preferredLanguage} onChange={set('preferredLanguage')}>
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </Field>
                </div>
              </motion.div>
            )}

            {step === 1 && (
              <motion.div key="medical" className="ps-fields" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                <div className="ps-grid">
                  <Field label="Blood group" required error={errors.bloodGroup} icon={<Droplet size={14} />}>
                    <select ref={reg('bloodGroup')} value={form.bloodGroup} onChange={set('bloodGroup')}>
                      <option value="">Select…</option>{BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
                    </select>
                  </Field>
                  <Field label="Preferred language" icon={<Languages size={14} />}>
                    <select value={form.preferredLanguage} onChange={set('preferredLanguage')}>
                      {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Allergies" icon={<AlertTriangle size={14} />} full>
                  <textarea rows={2} value={form.allergies} onChange={set('allergies')} placeholder="e.g. Penicillin, peanuts — or 'None'" />
                </Field>
                <Field label="Medical conditions" icon={<Vitals size={14} />} full>
                  <textarea rows={2} value={form.conditions} onChange={set('conditions')} placeholder="e.g. Asthma, diabetes — or 'None'" />
                </Field>
                <Field label="Disability" icon={<Accessibility size={14} />} full>
                  <textarea rows={2} value={form.disability} onChange={set('disability')} placeholder="Anything we should know — or 'None'" />
                </Field>
              </motion.div>
            )}

            {step === 2 && (
              <motion.div key="contacts" className="ps-fields" initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }}>
                <p className="ps-hint">Add up to 3 people we can reach in an emergency (optional).</p>
                {form.emergencyContacts.map((c, i) => (
                  <div key={i} className="ps-contact">
                    <div className="ps-contact-head">
                      <span>Contact {i + 1}</span>
                      {form.emergencyContacts.length > 1 && (
                        <button type="button" className="ps-remove" onClick={() => removeContact(i)}><Trash2 size={14} /> Remove</button>
                      )}
                    </div>
                    <div className="ps-grid">
                      <Field label="Name"><input value={c.name} onChange={setContact(i, 'name')} placeholder="Contact name" /></Field>
                      <Field label="Relationship"><input value={c.relationship} onChange={setContact(i, 'relationship')} placeholder="e.g. Spouse, Parent" /></Field>
                      <Field label="Phone"><input type="tel" value={c.phone} onChange={setContact(i, 'phone')} placeholder="Phone number" /></Field>
                    </div>
                  </div>
                ))}
                {form.emergencyContacts.length < 3 && (
                  <button type="button" className="ps-add" onClick={addContact}><Plus size={16} /> Add another contact</button>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="ps-footer">
          <div className="ps-footer-left">
            {step > 0 && <button className="ps-btn ghost" onClick={back}><ArrowLeft size={16} /> Back</button>}
          </div>
          <div className="ps-footer-right">
            {!isLast && <button className="ps-btn skip" onClick={skipToFinish} disabled={saving}>Skip</button>}
            <button className="ps-btn primary" onClick={advance} disabled={saving}>
              {saving ? 'Saving…' : isLast ? (isEditing ? 'Save changes' : 'Finish') : 'Continue'}
              {!saving && (isLast ? <Check size={16} /> : <ArrowRight size={16} />)}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

const Field = ({ label, hint, icon, full, required, error, children }) => (
  <label className={`ps-field ${full ? 'full' : ''} ${error ? 'error' : ''}`}>
    <span className="ps-label">{icon}{label}{required && <span className="ps-req">*</span>}</span>
    {children}
    {error ? <span className="ps-fielderr">Required</span> : hint ? <span className="ps-fieldhint">{hint}</span> : null}
  </label>
)

const PS_CSS = `
.ps { min-height: 100vh; background: var(--bg-body, #F8FAFC); display: flex; align-items: flex-start; justify-content: center; padding: 40px 20px; color: var(--text-primary, #0F172A); }
.ps-card { width: 100%; max-width: 720px; background: var(--bg-surface, #fff); border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 22px; box-shadow: 0 20px 50px -12px rgba(16,24,40,0.12); padding: 32px; }
.ps-brand { display: inline-flex; align-items: center; gap: 8px; font-weight: 800; font-size: 1.1rem; }
.ps-brand svg, .ps-brand span { color: var(--primary, #C4504B); }
.ps-title { font-size: 1.6rem; font-weight: 800; letter-spacing: -0.02em; margin: 16px 0 6px; }
.ps-sub { color: var(--text-muted, #64748B); margin: 0 0 20px; font-size: 0.95rem; line-height: 1.55; }
.ps-req { color: var(--primary, #C4504B); margin-left: 2px; font-weight: 700; }

.ps-completion { margin-bottom: 22px; }
.ps-completion-top { display: flex; justify-content: space-between; font-size: 0.78rem; font-weight: 600; color: var(--text-muted, #64748B); margin-bottom: 6px; }
.ps-bar { height: 8px; background: var(--surface-2, #F1F5F9); border-radius: 99px; overflow: hidden; }
.ps-bar-fill { height: 100%; background: linear-gradient(90deg, #C4504B, #E0736E); border-radius: 99px; }

.ps-stepper { display: flex; gap: 8px; margin-bottom: 24px; }
.ps-step { flex: 1; display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-radius: 12px; border: 1px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); cursor: pointer; text-align: left; transition: all 0.15s; min-width: 0; }
.ps-step.active { border-color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }
.ps-step.locked { opacity: 0.5; cursor: not-allowed; }
.ps-step-dot { width: 28px; height: 28px; border-radius: 50%; background: var(--surface-2, #F1F5F9); color: var(--text-muted, #64748B); display: grid; place-items: center; flex-shrink: 0; }
.ps-step.active .ps-step-dot { background: var(--primary, #C4504B); color: #fff; }
.ps-step.done .ps-step-dot { background: var(--success, #059669); color: #fff; }
.ps-step-label { font-size: 0.82rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; color: var(--text-secondary, #334155); }
.ps-step.active .ps-step-label { color: var(--primary, #C4504B); }

.ps-error { display: flex; align-items: center; gap: 8px; background: var(--sev-emergency-soft, #FBF1F0); border: 1px solid var(--sev-emergency-border, #F0CFCD); color: var(--primary, #C4504B); padding: 10px 14px; border-radius: 10px; font-size: 0.88rem; margin-bottom: 16px; }

.ps-body { min-height: 260px; }
.ps-fields { display: flex; flex-direction: column; gap: 14px; }
.ps-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
.ps-field { display: flex; flex-direction: column; gap: 6px; min-width: 0; }
.ps-field.full { grid-column: 1 / -1; }
.ps-label { display: inline-flex; align-items: center; gap: 6px; font-size: 0.8rem; font-weight: 600; color: var(--text-secondary, #334155); }
.ps-label svg { color: var(--text-muted, #64748B); }
.ps-field input, .ps-field select, .ps-field textarea { width: 100%; padding: 11px 13px; border-radius: 11px; border: 1.5px solid var(--border-subtle, #E5E7EB); background: var(--bg-surface, #fff); color: var(--text-primary, #0F172A); font-size: 0.92rem; transition: border-color 0.15s, box-shadow 0.15s; }
.ps-field input:focus, .ps-field select:focus, .ps-field textarea:focus { outline: none; border-color: var(--primary, #C4504B); box-shadow: 0 0 0 3px var(--primary-glow, rgba(196, 80, 75,0.1)); }
.ps-field.error input, .ps-field.error select, .ps-field.error textarea { border-color: var(--primary, #C4504B); background: var(--sev-emergency-soft, #FBF1F0); }
.ps-field textarea { resize: vertical; }
.ps-fieldhint { font-size: 0.75rem; color: var(--text-muted, #64748B); }
.ps-fielderr { font-size: 0.75rem; color: var(--primary, #C4504B); font-weight: 600; }
.ps-hint { color: var(--text-muted, #64748B); font-size: 0.9rem; margin: 0 0 4px; }

.ps-contact { border: 1px solid var(--border-subtle, #E5E7EB); border-radius: 14px; padding: 14px; background: var(--bg-body, #F8FAFC); }
.ps-contact-head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; font-size: 0.82rem; font-weight: 700; color: var(--text-secondary, #334155); }
.ps-remove { display: inline-flex; align-items: center; gap: 4px; background: transparent; border: none; color: var(--text-muted, #64748B); cursor: pointer; font-size: 0.78rem; }
.ps-remove:hover { color: var(--primary, #C4504B); }
.ps-add { display: inline-flex; align-items: center; gap: 6px; align-self: flex-start; background: var(--surface-2, #F1F5F9); border: 1px dashed var(--border-subtle, #CBD5E1); color: var(--text-secondary, #334155); padding: 10px 14px; border-radius: 11px; cursor: pointer; font-weight: 600; font-size: 0.85rem; }
.ps-add:hover { border-color: var(--primary, #C4504B); color: var(--primary, #C4504B); }

.ps-footer { display: flex; align-items: center; justify-content: space-between; margin-top: 26px; padding-top: 20px; border-top: 1px solid var(--border-subtle, #E5E7EB); gap: 12px; }
.ps-footer-right { display: flex; gap: 10px; }
.ps-btn { display: inline-flex; align-items: center; gap: 7px; font-weight: 700; font-size: 0.9rem; padding: 11px 18px; border-radius: 12px; border: 1px solid transparent; cursor: pointer; transition: all 0.15s; }
.ps-btn:disabled { opacity: 0.6; cursor: not-allowed; }
.ps-btn.primary { background: var(--primary, #C4504B); color: #fff; box-shadow: 0 2px 8px rgba(196, 80, 75,0.2); }
.ps-btn.primary:hover:not(:disabled) { background: var(--primary-hover, #A93F3B); }
.ps-btn.ghost { background: transparent; color: var(--text-secondary, #334155); border-color: var(--border-subtle, #E5E7EB); }
.ps-btn.ghost:hover { background: var(--surface-2, #F1F5F9); }
.ps-btn.skip { background: transparent; color: var(--text-muted, #64748B); }
.ps-btn.skip:hover:not(:disabled) { color: var(--text-primary, #0F172A); background: var(--surface-2, #F1F5F9); }

@media (max-width: 640px) {
  .ps-card { padding: 22px; }
  .ps-grid { grid-template-columns: 1fr; }
  .ps-step-label { display: none; }
  .ps-step { flex: 0 0 auto; justify-content: center; }
  .ps-stepper { justify-content: center; }
}
`

export default ProfileSetup
