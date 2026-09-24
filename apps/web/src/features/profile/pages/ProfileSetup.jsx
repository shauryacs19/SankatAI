import { useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { motion, AnimatePresence } from 'framer-motion'
import { User, HeartPulse, Phone, ArrowLeft, ArrowRight, Check, Plus, Trash2 } from 'lucide-react'
import { GENDERS, BLOOD_GROUPS, LANGUAGES, ageFromDob, motionTokens } from '@sankatai/shared'
import { saveProfile } from '../services/profileApi'
import { useAuth } from '../../../context/AuthContext.jsx'
import { useProfile } from '../context/ProfileContext.jsx'
import { Alert, Brand, Button, Field, IconButton, Input, Select, SkipLink, Textarea } from '../../../components/ui'
import { STANDALONE_CSS } from '../../../components/layout/standalone.styles'
import { errText } from '../../../utils/errText'

const emptyContact = { name: '', relationship: '', phone: '' }

const STEPS = [
  { key: 'personal', label: 'Personal details', Icon: User },
  { key: 'medical', label: 'Medical information', Icon: HeartPulse },
  { key: 'contacts', label: 'Emergency contacts', Icon: Phone },
]

// Required fields per step (must be filled before leaving that step).
const REQUIRED = { 0: ['firstName', 'dob', 'gender', 'phone', 'email'], 1: ['bloodGroup'], 2: [] }
const MESSAGES = {
  firstName: 'Enter your first name.', dob: 'Enter your date of birth.', gender: 'Choose an option.',
  phone: 'Enter a phone number.', email: 'Enter your email address.', bloodGroup: 'Choose your blood group, or “Unknown”.',
}
const REQUIRED_FIELDS = Object.values(REQUIRED).flat()

const makeInitial = (existing, email) => ({
  firstName: '', middleName: '', lastName: '', dob: '', gender: '',
  bloodGroup: '', phone: '', email: email || '',
  emergencyContacts: [{ ...emptyContact }],
  allergies: '', conditions: '', disability: '', preferredLanguage: 'English',
  ...(existing || {}),
  ...(existing && existing.emergencyContacts?.length ? { emergencyContacts: existing.emergencyContacts } : {}),
})

const CSS = `
.ps-progress { display: flex; flex-direction: column; gap: var(--space-3); }
.ps-steps { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-2); list-style: none; margin: 0; padding: 0; }
.ps-step {
  display: flex; align-items: center; gap: var(--space-2); width: 100%; min-height: var(--touch); padding: 0 var(--space-3);
  border: 1px solid var(--border-subtle); border-radius: var(--radius-control); background: var(--surface);
  font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-medium); color: var(--text-muted); text-align: left;
}
.ps-step:disabled { cursor: default; }
.ps-step[aria-current="step"] { border-color: var(--text-primary); color: var(--text-primary); }
.ps-step.is-done { color: var(--text-secondary); }
.ps-step.is-done:hover { background: var(--surface-hover); }
.ps-step-dot { display: grid; place-items: center; width: 1.5rem; height: 1.5rem; border-radius: var(--radius-pill); background: var(--surface-sunken); color: var(--text-muted); flex-shrink: 0; font-size: var(--fs-xs); font-weight: var(--fw-semibold); }
.ps-step[aria-current="step"] .ps-step-dot { background: var(--text-primary); color: var(--surface); }
.ps-step.is-done .ps-step-dot { background: var(--success); color: var(--surface); }
.ps-step-label { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ps-count { font-size: var(--fs-sm); line-height: var(--lh-sm); color: var(--text-muted); }
.ps-body { min-height: 16rem; }
.ps-fieldset { border: 0; margin: 0; padding: 0; min-width: 0; }
.ps-fieldset > legend.sa-lead { margin: 0 0 var(--space-1); padding: 0; }
.ps-contact { display: flex; flex-direction: column; gap: var(--space-4); padding: var(--space-4); border: 1px solid var(--border-subtle); border-radius: var(--radius-card); }
.ps-contact-head { display: flex; align-items: center; justify-content: space-between; font-size: var(--fs-sm); line-height: var(--lh-sm); font-weight: var(--fw-semibold); }
.ps-grid3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--space-4); }
@media (max-width: 639px) {
  .ps-step-label { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
  .ps-step { justify-content: center; }
  .ps-grid3 { grid-template-columns: minmax(0, 1fr); }
}
`

function ProfileSetup() {
  const navigate = useNavigate()
  const { profile: existing, setProfile } = useProfile()
  const { user } = useAuth()
  const [form, setForm] = useState(() => makeInitial(existing, user?.email))
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [serverError, setServerError] = useState('')
  const [errors, setErrors] = useState({}) // { fieldKey: message }
  const fieldRefs = useRef({})
  const errorRef = useRef(null)

  const age = useMemo(() => ageFromDob(form.dob), [form.dob])
  const isEditing = Boolean(existing)
  const isLast = step === STEPS.length - 1

  const set = (field) => (e) => {
    const value = e.target.value
    setForm((prev) => ({ ...prev, [field]: value }))
    if (errors[field] && String(value).trim()) setErrors((prev) => { const n = { ...prev }; delete n[field]; return n })
    if (serverError) setServerError('')
  }
  // Validate a required field when the user leaves it (not only on submit).
  const blur = (field) => () => {
    if (REQUIRED_FIELDS.includes(field) && !String(form[field] || '').trim()) setErrors((prev) => ({ ...prev, [field]: MESSAGES[field] }))
  }
  const setContact = (index, field) => (e) => {
    const value = e.target.value
    setForm((prev) => ({ ...prev, emergencyContacts: prev.emergencyContacts.map((c, i) => (i === index ? { ...c, [field]: value } : c)) }))
  }
  const addContact = () => setForm((prev) => (prev.emergencyContacts.length >= 3 ? prev : { ...prev, emergencyContacts: [...prev.emergencyContacts, { ...emptyContact }] }))
  const removeContact = (index) => setForm((prev) => ({ ...prev, emergencyContacts: prev.emergencyContacts.filter((_, i) => i !== index) }))

  const missing = (fields) => fields.filter((f) => !String(form[f] || '').trim())
  const flag = (fields) => {
    const next = {}
    fields.forEach((f) => { next[f] = MESSAGES[f] })
    setErrors(next)
    const first = fields[0]
    setTimeout(() => fieldRefs.current[first]?.focus?.(), 250) // after the step transition
  }

  // Continue: gated on the current step's required fields. On the last step it saves.
  const advance = () => {
    const m = missing(REQUIRED[step])
    if (m.length) { flag(m); return }
    setErrors({}); setServerError('')
    if (step < STEPS.length - 1) setStep(step + 1)
    else finish()
  }

  // Skip the optional steps and save now — only if every required field is filled.
  const skipToFinish = () => {
    const m = missing(REQUIRED_FIELDS)
    if (m.length) {
      const s = Number(Object.keys(REQUIRED).find((k) => REQUIRED[k].includes(m[0])))
      setStep(s)
      flag(m.filter((f) => REQUIRED[s].includes(f)))
      return
    }
    setErrors({}); setServerError('')
    finish()
  }

  const back = () => { setErrors({}); setServerError(''); setStep((s) => Math.max(0, s - 1)) }
  const gotoStep = (i) => { if (i < step) { setErrors({}); setServerError(''); setStep(i) } }

  const finish = async () => {
    setServerError('')
    const cleaned = { ...form, emergencyContacts: form.emergencyContacts.filter((c) => c.name.trim() || c.phone.trim()) }
    setSaving(true)
    try {
      const saved = await saveProfile(cleaned)
      setProfile(saved)
      navigate('/dashboard', { replace: true })
    } catch (err) {
      setServerError(errText(err, 'Could not save your profile. Please try again.'))
      setTimeout(() => errorRef.current?.scrollIntoView({ block: 'center' }), 0)
    } finally {
      setSaving(false)
    }
  }

  const reg = (key) => (el) => { fieldRefs.current[key] = el }
  const stepMotion = {
    initial: { opacity: 0, x: 12 },
    animate: { opacity: 1, x: 0, transition: { duration: motionTokens.duration.base / 1000, ease: motionTokens.easing.enter } },
    exit: { opacity: 0, x: -12, transition: { duration: motionTokens.duration.fast / 1000, ease: motionTokens.easing.exit } },
  }

  return (
    <div className="sa">
      <style>{STANDALONE_CSS + CSS}</style>
      <SkipLink />
      <header className="sa-bar">
        {isEditing
          ? <Button variant="ghost" icon={ArrowLeft} onClick={() => navigate('/dashboard/profile')}>Profile</Button>
          : <span aria-hidden="true" />}
        <Brand size="sm" className="sa-brand" />
        <Button variant="emergency" icon={Phone} href="tel:108" aria-label="Emergency — call 108">108</Button>
      </header>

      <main id="main" tabIndex={-1} className="sa-main">
        <div className="sa-card">
          <h1 className="sa-title">{isEditing ? 'Edit your profile' : 'Set up your health profile'}</h1>
          <p className="sa-lead">These details help SankatAI give safer, more relevant guidance. Fields marked <span className="ui-req" aria-hidden="true">*</span><span className="sr-only">with an asterisk</span> are required.</p>

          <nav className="ps-progress" aria-label="Profile steps">
            <p className="ps-count">Step {step + 1} of {STEPS.length}</p>
            <ol className="ps-steps">
              {STEPS.map((s, i) => (
                <li key={s.key}>
                  <button
                    type="button"
                    className={`ps-step ${i < step ? 'is-done' : ''}`}
                    aria-current={i === step ? 'step' : undefined}
                    disabled={i >= step}
                    onClick={() => gotoStep(i)}
                    aria-label={`${s.label}${i < step ? ' (completed)' : i === step ? ' (current)' : ''}`}
                  >
                    <span className="ps-step-dot" aria-hidden="true">{i < step ? <Check size={14} /> : i + 1}</span>
                    <span className="ps-step-label">{s.label}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>

          {serverError && <div ref={errorRef}><Alert tone="danger" title="Your profile wasn't saved.">{serverError}</Alert></div>}

          <div className="ps-body">
            <AnimatePresence mode="wait" initial={false}>
              {step === 0 && (
                <motion.fieldset key="personal" className="ps-fieldset" {...stepMotion}>
                  <legend className="sr-only">Personal details</legend>
                  <div className="ui-form-grid">
                    <Field label="First name" required error={errors.firstName}>
                      <Input ref={reg('firstName')} autoComplete="given-name" value={form.firstName} onChange={set('firstName')} onBlur={blur('firstName')} />
                    </Field>
                    <Field label="Last name" optional>
                      <Input autoComplete="family-name" value={form.lastName} onChange={set('lastName')} />
                    </Field>
                    <Field label="Middle name" optional>
                      <Input autoComplete="additional-name" value={form.middleName} onChange={set('middleName')} />
                    </Field>
                    <Field label="Date of birth" required error={errors.dob} hint={age != null ? `Age: ${age} years` : undefined}>
                      <Input ref={reg('dob')} type="date" autoComplete="bday" value={form.dob} onChange={set('dob')} onBlur={blur('dob')} max={new Date().toISOString().slice(0, 10)} />
                    </Field>
                    <Field label="Gender" required error={errors.gender}>
                      <Select ref={reg('gender')} value={form.gender} onChange={set('gender')} onBlur={blur('gender')}>
                        <option value="">Choose…</option>{GENDERS.map((g) => <option key={g} value={g}>{g}</option>)}
                      </Select>
                    </Field>
                    <Field label="Phone number" required error={errors.phone} hint="Include the country code, e.g. +91.">
                      <Input ref={reg('phone')} type="tel" autoComplete="tel" value={form.phone} onChange={set('phone')} onBlur={blur('phone')} placeholder="+91 98765 43210" />
                    </Field>
                    <Field label="Email" required error={errors.email}>
                      <Input ref={reg('email')} type="email" autoComplete="email" value={form.email} onChange={set('email')} onBlur={blur('email')} />
                    </Field>
                    <Field label="Preferred language">
                      <Select value={form.preferredLanguage} onChange={set('preferredLanguage')}>
                        {LANGUAGES.map((l) => <option key={l} value={l}>{l}</option>)}
                      </Select>
                    </Field>
                  </div>
                </motion.fieldset>
              )}

              {step === 1 && (
                <motion.fieldset key="medical" className="ps-fieldset" {...stepMotion}>
                  <legend className="sr-only">Medical information</legend>
                  <div className="ui-form-grid">
                    <Field label="Blood group" required error={errors.bloodGroup}>
                      <Select ref={reg('bloodGroup')} value={form.bloodGroup} onChange={set('bloodGroup')} onBlur={blur('bloodGroup')}>
                        <option value="">Choose…</option>{BLOOD_GROUPS.map((b) => <option key={b} value={b}>{b}</option>)}
                      </Select>
                    </Field>
                    <Field label="Allergies" optional className="is-full" hint="Medicines, foods or anything else. Leave empty if you're not sure.">
                      <Textarea rows={2} value={form.allergies} onChange={set('allergies')} placeholder="e.g. Penicillin, peanuts" />
                    </Field>
                    <Field label="Medical conditions" optional className="is-full">
                      <Textarea rows={2} value={form.conditions} onChange={set('conditions')} placeholder="e.g. Asthma, diabetes" />
                    </Field>
                    <Field label="Disability" optional className="is-full">
                      <Textarea rows={2} value={form.disability} onChange={set('disability')} placeholder="Anything we should know" />
                    </Field>
                  </div>
                </motion.fieldset>
              )}

              {step === 2 && (
                <motion.fieldset key="contacts" className="ps-fieldset ui-form" {...stepMotion}>
                  <legend className="sa-lead">Add up to 3 people SankatAI can help you call or send your location to in an emergency. Optional, but strongly recommended.</legend>
                  {form.emergencyContacts.map((c, i) => (
                    <div key={i} className="ps-contact">
                      <div className="ps-contact-head">
                        <span>Contact {i + 1}</span>
                        {form.emergencyContacts.length > 1 && <IconButton label={`Remove contact ${i + 1}`} icon={Trash2} size={16} variant="danger" onClick={() => removeContact(i)} tooltipAlign="end" />}
                      </div>
                      <div className="ps-grid3">
                        <Field label="Name"><Input autoComplete="off" value={c.name} onChange={setContact(i, 'name')} /></Field>
                        <Field label="Relationship"><Input value={c.relationship} onChange={setContact(i, 'relationship')} placeholder="e.g. Spouse" /></Field>
                        <Field label="Phone"><Input type="tel" value={c.phone} onChange={setContact(i, 'phone')} placeholder="+91…" /></Field>
                      </div>
                    </div>
                  ))}
                  {form.emergencyContacts.length < 3 && (
                    <div><Button variant="secondary" icon={Plus} onClick={addContact}>Add another contact</Button></div>
                  )}
                </motion.fieldset>
              )}
            </AnimatePresence>
          </div>

          <div className="ui-form-actions">
            {step > 0 && <Button variant="ghost" icon={ArrowLeft} onClick={back} className="ui-form-actions-start" disabled={saving}>Back</Button>}
            {!isLast && <Button variant="ghost" onClick={skipToFinish} disabled={saving}>Skip optional steps</Button>}
            <Button
              variant="primary"
              onClick={advance}
              loading={saving}
              loadingText="Saving your details…"
              iconEnd={isLast ? Check : ArrowRight}
            >
              {isLast ? (isEditing ? 'Save changes' : 'Finish') : 'Continue'}
            </Button>
          </div>
        </div>
      </main>
    </div>
  )
}

export default ProfileSetup
