import { useState } from 'react'
import { HeartPulse, Activity, ShieldCheck } from 'lucide-react-native'
import { useProfile } from '../../context/ProfileContext'
import { saveProfile } from '../../lib/api'
import { isPhone } from '../../lib/validators'
import { Field, YesNo, SectionTitle, SectionEditor } from '../../components/FormControls'
import SelectModal from '../../components/SelectModal'
import { BLOOD_GROUPS as BLOOD } from '../../lib/profileOptions'

const emptyInsurance = { provider: '', policyNumber: '', policyHolder: '', helpline: '' }

export default function MedicalInfoScreen({ navigation }) {
  const { profile, setProfile } = useProfile()
  const [form, setForm] = useState(() => ({
    bloodGroup: profile?.bloodGroup || '',
    allergies: profile?.allergies || '',
    conditions: profile?.conditions || '',
    disability: profile?.disability || '',
    smoker: profile?.smoker || 'no',
    heartHistory: profile?.heartHistory || 'no',
    insurance: { ...emptyInsurance, ...(profile?.insurance || {}) },
  }))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (v) => setForm((p) => ({ ...p, [k]: v }))
  const setIns = (k) => (v) => setForm((p) => ({ ...p, insurance: { ...p.insurance, [k]: v } }))

  const onSave = async () => {
    setError('')
    if (form.insurance.helpline && !isPhone(form.insurance.helpline)) {
      setErrors({ helpline: 'Enter a valid phone number.' }); return
    }
    setErrors({})
    setSaving(true)
    try {
      const saved = await saveProfile({ ...profile, ...form })
      setProfile(saved)
      navigation.goBack()
    } catch (e) { setError(e.message || 'Could not save. Please try again.') }
    finally { setSaving(false) }
  }

  return (
    <SectionEditor title="Medical information" navigation={navigation} onSave={onSave} saving={saving} error={error}>
      <SectionTitle Icon={HeartPulse} title="Medical" />
      <SelectModal label="Blood group" value={form.bloodGroup} options={BLOOD} onChange={set('bloodGroup')} placeholder="Select blood group" />
      <Field label="Allergies" value={form.allergies} onChangeText={set('allergies')} multiline placeholder="e.g. Penicillin — or 'None'" />
      <Field label="Conditions" value={form.conditions} onChangeText={set('conditions')} multiline placeholder="e.g. Asthma — or 'None'" />
      <Field label="Disability" value={form.disability} onChangeText={set('disability')} multiline placeholder="Anything we should know — or 'None'" />

      <SectionTitle Icon={Activity} title="Risk factors" />
      <YesNo label="Do you smoke?" value={form.smoker} onSelect={set('smoker')} />
      <YesNo label="History of heart issues?" value={form.heartHistory} onSelect={set('heartHistory')} />

      <SectionTitle Icon={ShieldCheck} title="Insurance" />
      <Field label="Provider name" value={form.insurance.provider} onChangeText={setIns('provider')} placeholder="e.g. LIC, HDFC Ergo" />
      <Field label="Policy number" value={form.insurance.policyNumber} onChangeText={setIns('policyNumber')} placeholder="e.g. 123456789" />
      <Field label="Policy holder" value={form.insurance.policyHolder} onChangeText={setIns('policyHolder')} placeholder="Name on card" />
      <Field label="Helpline number" value={form.insurance.helpline} onChangeText={setIns('helpline')} keyboardType="phone-pad" error={errors.helpline} placeholder="Emergency support #" />
    </SectionEditor>
  )
}
