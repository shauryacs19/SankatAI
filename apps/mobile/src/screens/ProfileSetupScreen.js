import { useEffect, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, Animated, Dimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { User, HeartPulse, Phone, Plus, Trash2, Check, AlertCircle } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { saveProfile } from '../lib/api'
import { getCurrentEmail } from '../lib/cognito'
import { isProfileComplete, useProfile } from '../context/ProfileContext'
import { isEmail, isISODate, isPhone } from '../lib/validators'
import { Field } from '../components/FormControls'
import SelectModal from '../components/SelectModal'
import CountryPicker from '../components/CountryPicker'
import { DateWheels } from '../components/WheelPicker'
import { DEFAULT_COUNTRY, countryFromPhone, localNumber } from '../lib/countries'
import { ageFromDob, GENDERS, BLOOD_GROUPS as BLOOD, LANGUAGES as LANGS } from '../lib/profileOptions'

const emptyContact = { name: '', relationship: '', phone: '' }
const { width: SCREEN_W } = Dimensions.get('window')

const REQUIRED_ALL = ['firstName', 'gender', 'dob', 'phone', 'email', 'bloodGroup']
const REQ_LABEL = { firstName: 'First name', gender: 'Gender', dob: 'Date of birth', phone: 'Phone number', email: 'Email', bloodGroup: 'Blood group' }

const initial = (existing) => ({
  firstName: '', middleName: '', lastName: '', dob: '', gender: '', bloodGroup: '',
  phone: '', email: getCurrentEmail() || '', emergencyContacts: [{ ...emptyContact }],
  allergies: '', conditions: '', disability: '', preferredLanguage: 'English',
  ...(existing || {}),
  emergencyContacts: Array.isArray(existing?.emergencyContacts) && existing.emergencyContacts.length
    ? existing.emergencyContacts
    : [{ ...emptyContact }],
})

export default function ProfileSetupScreen({ navigation }) {
  const { profile: existing, setProfile } = useProfile()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [form, setForm] = useState(() => initial(existing))
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState('')
  const [errors, setErrors] = useState({})

  // Phone is composed of a country + a local number.
  const [country, setCountry] = useState(() => countryFromPhone(existing?.phone) || DEFAULT_COUNTRY)
  const [localPhone, setLocalPhone] = useState(() => (existing?.phone ? localNumber(existing.phone, countryFromPhone(existing.phone) || DEFAULT_COUNTRY) : ''))

  const isEditing = Boolean(existing)
  const age = ageFromDob(form.dob)

  // Subtle entrance motion keeps the long single-page form feeling polished.
  const slide = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(1)).current
  useEffect(() => {
    slide.setValue(SCREEN_W * 0.035)
    opacity.setValue(0)
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start()
  }, [slide, opacity])

  // Keep form.phone in sync with country + local number.
  useEffect(() => {
    const composed = localPhone.trim() ? `+${country.dial} ${localPhone.trim()}` : ''
    setForm((p) => (p.phone === composed ? p : { ...p, phone: composed }))
    if (errors.phone && composed) setErrors((e) => ({ ...e, phone: undefined }))
  }, [country, localPhone]) // eslint-disable-line react-hooks/exhaustive-deps

  const set = (k) => (v) => { setForm((p) => ({ ...p, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); if (banner) setBanner('') }
  const setContact = (i, k) => (v) => setForm((p) => ({ ...p, emergencyContacts: p.emergencyContacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }))
  const addContact = () => setForm((p) => (p.emergencyContacts.length >= 3 ? p : { ...p, emergencyContacts: [...p.emergencyContacts, { ...emptyContact }] }))
  const removeContact = (i) => setForm((p) => ({ ...p, emergencyContacts: p.emergencyContacts.filter((_, j) => j !== i) }))

  const validateFields = (fields) => {
    const next = {}
    fields.forEach((key) => {
      if (!String(form[key] || '').trim()) next[key] = `${REQ_LABEL[key]} is required.`
      else if (key === 'dob' && !isISODate(form.dob)) next[key] = 'Enter a valid date of birth.'
      else if (key === 'email' && !isEmail(form.email)) next[key] = 'Enter a valid email address.'
      else if (key === 'phone' && !isPhone(form.phone)) next[key] = 'Enter a valid phone number.'
    })
    return next
  }

  const skipToFinish = () => {
    const nextErrors = validateFields(REQUIRED_ALL)
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); setBanner(Object.values(nextErrors)[0]); return }
    setErrors({}); setBanner('')
    finish()
  }

  const finish = async () => {
    const nextErrors = validateFields(REQUIRED_ALL)
    if (Object.keys(nextErrors).length) {
      setErrors(nextErrors)
      setBanner(Object.values(nextErrors)[0])
      return
    }
    setBanner('')
    const cleaned = { ...form, emergencyContacts: form.emergencyContacts.filter((c) => c.name.trim() || c.phone.trim()) }
    setSaving(true)
    try {
      const saved = await saveProfile(cleaned)
      if (!isProfileComplete(saved)) throw new Error('Some required details are still missing. Please review your profile.')
      setProfile(saved)
      navigation.reset({ index: 0, routes: [{ name: 'App' }] })
    } catch (e) { setBanner(e.message || 'Could not save your profile. Please try again.') }
    finally { setSaving(false) }
  }

  const renderForm = () => (
          <>
            <View style={styles.sectionHeading}><User size={18} color={colors.primary} /><View style={styles.sectionHeadingCopy}><Text style={styles.sectionTitle}>Personal details</Text><Text style={styles.sectionSub}>Your details help us tailor guidance and reach you if needed.</Text></View></View>
            <Field label="First name *" value={form.firstName} onChangeText={set('firstName')} error={errors.firstName ? 'Required' : undefined} autoFocus />
            <Field label="Last name" value={form.lastName} onChangeText={set('lastName')} placeholder="Optional" autoComplete="family-name" />
            <Field label="Middle name" value={form.middleName} onChangeText={set('middleName')} placeholder="Optional" autoComplete="additional-name" />
            <Text style={styles.label}>Date of birth *</Text>
            <DateWheels value={form.dob} onChange={set('dob')} minYear={1947} />
            {age != null ? <Text style={styles.fieldHint}>Age: {age} years</Text> : <Text style={styles.fieldHint}>No date selected yet — scroll each wheel to choose.</Text>}
            {!!errors.dob && <Text style={styles.inputError}>{errors.dob}</Text>}
            <SelectModal label="Gender *" value={form.gender} options={GENDERS} onChange={set('gender')} placeholder="Choose…" />
            {!!errors.gender && <Text style={styles.inputError}>{errors.gender}</Text>}
            <View style={styles.phoneField}>
              <Text style={styles.label}>Phone number *</Text>
              <View style={styles.phoneRow}>
                <CountryPicker value={country} onChange={setCountry} />
                <View style={styles.phoneInputWrap}>
                  <TextInput style={[styles.phoneInput, errors.phone && styles.inputInvalid]} value={localPhone} onChangeText={(t) => setLocalPhone(t.replace(/[^\d]/g, ''))} placeholder="98765 43210" placeholderTextColor={colors.muted} keyboardType="phone-pad" autoComplete="tel" />
                </View>
              </View>
              {!!errors.phone && <Text style={styles.inputError}>{errors.phone}</Text>}
              <Text style={styles.fieldHint}>Include your country code.</Text>
            </View>
            <Field label="Email *" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" autoCorrect={false} error={errors.email ? 'Enter a valid email address.' : undefined} autoComplete="email" />
            <SelectModal label="Preferred language" value={form.preferredLanguage} options={LANGS} onChange={set('preferredLanguage')} searchable />
            <View style={styles.sectionHeading}><HeartPulse size={18} color={colors.primary} /><View style={styles.sectionHeadingCopy}><Text style={styles.sectionTitle}>Medical information</Text><Text style={styles.sectionSub}>Blood group is required. Other details are optional and can help in an emergency.</Text></View></View>
            <SelectModal label="Blood group *" value={form.bloodGroup} options={BLOOD} onChange={set('bloodGroup')} placeholder="Select blood group" />
            {!!errors.bloodGroup && <Text style={styles.inputError}>{errors.bloodGroup}</Text>}
            <Field label="Allergies" value={form.allergies} onChangeText={set('allergies')} multiline placeholder="e.g. Penicillin, peanuts — or 'None'" />
            <Field label="Medical conditions" value={form.conditions} onChangeText={set('conditions')} multiline placeholder="e.g. Asthma, diabetes — or 'None'" />
            <Field label="Disability" value={form.disability} onChangeText={set('disability')} multiline placeholder="Anything we should know — or 'None'" />
            <View style={styles.sectionHeading}><Phone size={18} color={colors.primary} /><View style={styles.sectionHeadingCopy}><Text style={styles.sectionTitle}>Emergency contacts</Text><Text style={styles.sectionSub}>Add up to three people who can help. This section is optional.</Text></View></View>
            {form.emergencyContacts.map((c, i) => (
              <View key={i} style={styles.contact}>
                <View style={styles.contactHead}>
                  <Text style={styles.contactTitle}>Contact {i + 1}</Text>
                  {form.emergencyContacts.length > 1 && (
                    <TouchableOpacity onPress={() => removeContact(i)} style={styles.remove}><Trash2 size={14} color={colors.muted} /><Text style={styles.removeText}>Remove</Text></TouchableOpacity>
                  )}
                </View>
                <Field label="Name" value={c.name} onChangeText={setContact(i, 'name')} />
                <Field label="Relationship" value={c.relationship} onChangeText={setContact(i, 'relationship')} />
                <Field label="Phone (with country code)" value={c.phone} onChangeText={setContact(i, 'phone')} keyboardType="phone-pad" placeholder="+91 98765 43210" />
              </View>
            ))}
            {form.emergencyContacts.length < 3 && (
              <TouchableOpacity style={styles.addBtn} onPress={addContact}><Plus size={16} color={colors.primary} /><Text style={styles.addText}>Add another contact</Text></TouchableOpacity>
            )}
          </>
  )

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.header}>
          <Text style={styles.progressCount}>{isEditing ? 'Update your profile' : 'Complete your profile'}</Text>
          <Text style={styles.headerSub}>Required details are marked with *. Medical notes and emergency contacts are optional.</Text>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ opacity, transform: [{ translateX: slide }] }}>
            {!!banner && <View style={styles.errBanner}><AlertCircle size={15} color={colors.primary} /><Text style={styles.errBannerText}>{banner}</Text></View>}
            <View style={styles.stepBody}>{renderForm()}</View>
          </Animated.View>
        </ScrollView>

        <View style={styles.footer} pointerEvents="box-none">
          <View style={styles.footerRight}>
            <TouchableOpacity style={[styles.skipBtn, saving && styles.disabledBtn]} onPress={skipToFinish} disabled={saving} activeOpacity={0.8}><Text style={styles.skipText}>Skip optional steps</Text></TouchableOpacity>
            <TouchableOpacity style={styles.nextBtn} onPress={skipToFinish} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Check size={18} color={colors.onPrimary} />}
              <Text style={styles.nextText}>{saving ? 'Saving…' : isEditing ? 'Save profile' : 'Finish setup'}</Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 14, backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 },
  progressCount: { color: colors.muted, fontSize: 12, fontWeight: '600', marginBottom: 9 },
  headerSub: { color: colors.muted, fontSize: 12, lineHeight: 18 },
  scroll: { padding: 20, paddingBottom: 150, flexGrow: 1 },
  errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.dangerSoft, borderColor: colors.dangerBorder, borderWidth: 1, borderRadius: radius.md, padding: 11, marginTop: 14 },
  errBannerText: { color: colors.primary, fontSize: 13, flex: 1 },
  stepBody: { marginTop: 0 },
  sectionHeading: { flexDirection: 'row', alignItems: 'flex-start', gap: 11, marginTop: 22, marginBottom: 2, paddingTop: 17, borderTopWidth: 1, borderTopColor: colors.border },
  sectionHeadingCopy: { flex: 1 },
  sectionTitle: { color: colors.text, fontWeight: '800', fontSize: 17 },
  sectionSub: { color: colors.muted, fontSize: 12, lineHeight: 17, marginTop: 3 },
  label: { fontSize: 13, fontWeight: '600', color: colors.textSecondary, marginTop: 16, marginBottom: 4 },
  phoneField: { marginTop: 2 },
  phoneRow: { flexDirection: 'row', gap: 10, marginTop: 4, alignItems: 'stretch' },
  phoneInputWrap: { flex: 1 },
  phoneInput: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  inputInvalid: { borderColor: colors.danger },
  inputError: { color: colors.danger, fontSize: 12, marginTop: 5 },
  fieldHint: { color: colors.muted, fontSize: 12, marginTop: 5 },
  contact: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, marginTop: 14, backgroundColor: colors.surface },
  contactHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contactTitle: { fontWeight: '700', color: colors.textSecondary },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  removeText: { color: colors.muted, fontSize: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, marginTop: 14 },
  addText: { color: colors.primary, fontWeight: '600' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 14, backgroundColor: colors.bg, borderTopWidth: 1, borderTopColor: colors.border },
  footerRight: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 9 },
  skipText: { color: colors.muted, fontWeight: '600', fontSize: 12 },
  disabledBtn: { opacity: 0.5 },
  nextBtn: { minHeight: 48, borderRadius: radius.md, backgroundColor: colors.primary, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 12, paddingHorizontal: 16, shadowColor: colors.primary, shadowOpacity: 0.25, shadowRadius: 8, shadowOffset: { width: 0, height: 3 }, elevation: 4 },
  nextText: { color: colors.onPrimary, fontWeight: '700', fontSize: 14 },
})
