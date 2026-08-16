import { useState } from 'react'
import { View, TextInput, Text, StyleSheet } from 'react-native'
import { useProfile } from '../../context/ProfileContext'
import { saveProfile } from '../../lib/api'
import { isEmail, isPhone } from '../../lib/validators'
import { radius } from '../../theme'
import { useTheme } from '../../context/ThemeContext'
import { Field, SectionEditor } from '../../components/FormControls'
import SelectModal from '../../components/SelectModal'
import CountryPicker from '../../components/CountryPicker'
import DateField from '../../components/DateField'
import { DEFAULT_COUNTRY, countryFromPhone, localNumber } from '../../lib/countries'
import { GENDERS, LANGUAGES as LANGS } from '../../lib/profileOptions'

export default function PersonalInfoScreen({ navigation }) {
  const { profile, setProfile } = useProfile()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [form, setForm] = useState(() => ({
    firstName: profile?.firstName || '', middleName: profile?.middleName || '', lastName: profile?.lastName || '',
    dob: profile?.dob || '', gender: profile?.gender || '', email: profile?.email || '',
    preferredLanguage: profile?.preferredLanguage || 'English',
  }))
  const [country, setCountry] = useState(() => countryFromPhone(profile?.phone) || DEFAULT_COUNTRY)
  const [localPhone, setLocalPhone] = useState(() => (profile?.phone ? localNumber(profile.phone, countryFromPhone(profile.phone) || DEFAULT_COUNTRY) : ''))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  const set = (k) => (v) => { setForm((p) => ({ ...p, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })) }
  const phone = localPhone.trim() ? `+${country.dial} ${localPhone.trim()}` : ''

  const validate = () => {
    const e = {}
    if (!form.firstName.trim()) e.firstName = 'First name is required.'
    if (form.email && !isEmail(form.email)) e.email = 'Enter a valid email.'
    if (phone && !isPhone(phone)) e.phone = 'Enter a valid phone number.'
    setErrors(e)
    return Object.keys(e).length === 0
  }

  const onSave = async () => {
    setError('')
    if (!validate()) return
    setSaving(true)
    try {
      const saved = await saveProfile({ ...profile, ...form, phone }) // PUT replaces — merge over current
      setProfile(saved)
      navigation.goBack()
    } catch (e) { setError(e.message || 'Could not save. Please try again.') }
    finally { setSaving(false) }
  }

  return (
    <SectionEditor title="Personal information" navigation={navigation} onSave={onSave} saving={saving} error={error}>
      <Field label="First name" value={form.firstName} onChangeText={set('firstName')} error={errors.firstName} />
      <Field label="Middle name (optional)" value={form.middleName} onChangeText={set('middleName')} />
      <Field label="Last name" value={form.lastName} onChangeText={set('lastName')} />
      <DateField label="Date of birth" value={form.dob} onChange={set('dob')} />
      <SelectModal label="Gender" value={form.gender} options={GENDERS} onChange={set('gender')} placeholder="Select gender" />

      <View style={styles.phoneField}>
        <Text style={styles.label}>Phone number</Text>
        <View style={styles.phoneRow}>
          <CountryPicker value={country} onChange={setCountry} />
          <TextInput style={[styles.phoneInput, errors.phone && styles.inputError]} value={localPhone} onChangeText={(t) => { setLocalPhone(t.replace(/[^\d]/g, '')); if (errors.phone) setErrors((e) => ({ ...e, phone: undefined })) }} placeholder="Phone number" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
        </View>
        {!!errors.phone && <Text style={styles.err}>{errors.phone}</Text>}
      </View>

      <Field label="Email" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" error={errors.email} />
      <SelectModal label="Preferred language" value={form.preferredLanguage} options={LANGS} onChange={set('preferredLanguage')} searchable />
    </SectionEditor>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  phoneField: { marginTop: 14 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginBottom: 6 },
  phoneRow: { flexDirection: 'row', gap: 10 },
  phoneInput: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  inputError: { borderColor: colors.primary },
  err: { color: colors.primary, fontSize: 12, marginTop: 5 },
})
