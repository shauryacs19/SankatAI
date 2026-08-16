import { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, ScrollView, ActivityIndicator, StyleSheet, KeyboardAvoidingView, Platform, Animated, Dimensions } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { User, HeartPulse, Phone, Plus, Trash2, ArrowLeft, ArrowRight, Check, AlertCircle } from 'lucide-react-native'
import { radius } from '../theme'
import { useTheme } from '../context/ThemeContext'
import { saveProfile } from '../lib/api'
import { getCurrentEmail } from '../lib/cognito'
import { useProfile } from '../context/ProfileContext'
import { isEmail, isISODate, isPhone } from '../lib/validators'
import { Field, YesNo } from '../components/FormControls'
import SelectModal from '../components/SelectModal'
import CountryPicker from '../components/CountryPicker'
import { DateWheels } from '../components/WheelPicker'
import { DEFAULT_COUNTRY, countryFromPhone, localNumber } from '../lib/countries'
import { GENDERS, BLOOD_GROUPS as BLOOD, LANGUAGES as LANGS } from '../lib/profileOptions'

const emptyContact = { name: '', relationship: '', phone: '' }
const { width: SCREEN_W } = Dimensions.get('window')

// One question per step (Hinge-style), grouped into 3 categories for the header.
const STEP_LIST = [
  { key: 'name', cat: 'Personal', title: "What's your name?", sub: 'This is how Sankat.AI will address you.' },
  { key: 'gender', cat: 'Personal', title: 'How do you identify?', sub: 'Helps personalise medical guidance.' },
  { key: 'dob', cat: 'Personal', title: 'When were you born?', sub: 'Your age helps tailor triage.' },
  { key: 'phone', cat: 'Personal', title: 'Your phone number', sub: 'Pick your country, then enter your number.' },
  { key: 'email', cat: 'Personal', title: 'Contact & language', sub: 'Where to reach you and your preferred language.' },
  { key: 'medical', cat: 'Medical', title: 'Medical information', sub: 'Blood group is required; the rest is optional.' },
  { key: 'contacts', cat: 'Contacts', title: 'Emergency contacts', sub: 'Up to 3 people we can reach for you.' },
]
const CATS = [
  { key: 'Personal', Icon: User },
  { key: 'Medical', Icon: HeartPulse },
  { key: 'Contacts', Icon: Phone },
]
const REQUIRED_BY_STEP = { name: 'firstName', gender: 'gender', dob: 'dob', phone: 'phone', email: 'email', medical: 'bloodGroup' }
const REQUIRED_ALL = ['firstName', 'gender', 'dob', 'phone', 'email', 'bloodGroup']
const REQ_LABEL = { firstName: 'First name', gender: 'Gender', dob: 'Date of birth', phone: 'Phone number', email: 'Email', bloodGroup: 'Blood group' }
const catFirstIndex = (cat) => STEP_LIST.findIndex((s) => s.cat === cat)
const catLastIndex = (cat) => STEP_LIST.map((s) => s.cat).lastIndexOf(cat)

const initial = (existing) => ({
  firstName: '', middleName: '', lastName: '', dob: '', gender: '', bloodGroup: '',
  phone: '', email: getCurrentEmail() || '', emergencyContacts: [{ ...emptyContact }],
  allergies: '', conditions: '', disability: '', preferredLanguage: 'English',
  insurance: { provider: '', policyNumber: '', policyHolder: '', helpline: '' }, smoker: 'no', heartHistory: 'no',
  ...(existing || {}),
  ...(existing && existing.emergencyContacts?.length ? { emergencyContacts: existing.emergencyContacts } : {}),
})

export default function ProfileSetupScreen({ navigation }) {
  const { profile: existing, setProfile } = useProfile()
  const { colors } = useTheme()
  const styles = makeStyles(colors)
  const [form, setForm] = useState(() => initial(existing))
  const [step, setStep] = useState(0)
  const [saving, setSaving] = useState(false)
  const [banner, setBanner] = useState('')
  const [errors, setErrors] = useState({})

  // Phone is composed of a country + a local number.
  const [country, setCountry] = useState(() => countryFromPhone(existing?.phone) || DEFAULT_COUNTRY)
  const [localPhone, setLocalPhone] = useState(() => (existing?.phone ? localNumber(existing.phone, countryFromPhone(existing.phone) || DEFAULT_COUNTRY) : ''))

  const current = STEP_LIST[step]
  const isLast = step === STEP_LIST.length - 1
  const isEditing = Boolean(existing)

  // Slide + fade transition between questions.
  const slide = useRef(new Animated.Value(0)).current
  const opacity = useRef(new Animated.Value(1)).current
  const prevStep = useRef(0)
  useEffect(() => {
    const dir = step >= prevStep.current ? 1 : -1
    prevStep.current = step
    slide.setValue(dir * SCREEN_W * 0.18)
    opacity.setValue(0)
    Animated.parallel([
      Animated.timing(slide, { toValue: 0, duration: 260, useNativeDriver: true }),
      Animated.timing(opacity, { toValue: 1, duration: 260, useNativeDriver: true }),
    ]).start()
  }, [step, slide, opacity])

  // Seed a sensible default the first time the date step is shown.
  useEffect(() => {
    if (current.key === 'dob' && !form.dob) setForm((p) => ({ ...p, dob: '2000-01-01' }))
  }, [current.key, form.dob])

  // Keep form.phone in sync with country + local number.
  useEffect(() => {
    const composed = localPhone.trim() ? `+${country.dial} ${localPhone.trim()}` : ''
    setForm((p) => (p.phone === composed ? p : { ...p, phone: composed }))
    if (errors.phone && composed) setErrors((e) => ({ ...e, phone: undefined }))
  }, [country, localPhone]) // eslint-disable-line react-hooks/exhaustive-deps

  const completion = useMemo(() => {
    const filled = REQUIRED_ALL.filter((f) => String(form[f] || '').trim()).length
    return Math.round((filled / REQUIRED_ALL.length) * 100)
  }, [form])

  const set = (k) => (v) => { setForm((p) => ({ ...p, [k]: v })); if (errors[k]) setErrors((e) => ({ ...e, [k]: undefined })); if (banner) setBanner('') }
  const setIns = (k) => (v) => setForm((p) => ({ ...p, insurance: { ...p.insurance, [k]: v } }))
  const setContact = (i, k) => (v) => setForm((p) => ({ ...p, emergencyContacts: p.emergencyContacts.map((c, j) => (j === i ? { ...c, [k]: v } : c)) }))
  const addContact = () => setForm((p) => (p.emergencyContacts.length >= 3 ? p : { ...p, emergencyContacts: [...p.emergencyContacts, { ...emptyContact }] }))
  const removeContact = (i) => setForm((p) => ({ ...p, emergencyContacts: p.emergencyContacts.filter((_, j) => j !== i) }))

  const validateStep = () => {
    const key = REQUIRED_BY_STEP[current.key]
    if (!key) return null
    if (!String(form[key] || '').trim()) return `${REQ_LABEL[key]} is required.`
    if (key === 'dob' && !isISODate(form.dob)) return 'Enter a valid date.'
    if (key === 'email' && !isEmail(form.email)) return 'Enter a valid email.'
    if (key === 'phone' && !isPhone(form.phone)) return 'Enter a valid phone number.'
    return null
  }

  const advance = () => {
    const err = validateStep()
    if (err) {
      const key = REQUIRED_BY_STEP[current.key]
      setErrors({ [key]: true }); setBanner(err); return
    }
    setErrors({}); setBanner('')
    if (!isLast) setStep(step + 1); else finish()
  }
  const skip = () => { setErrors({}); setBanner(''); if (!isLast) setStep(step + 1); else finish() }
  const back = () => { setErrors({}); setBanner(''); setStep((s) => Math.max(0, s - 1)) }
  const gotoCat = (cat) => { const i = catFirstIndex(cat); if (i < step) { setErrors({}); setBanner(''); setStep(i) } }

  const finish = async () => {
    setBanner('')
    const cleaned = { ...form, emergencyContacts: form.emergencyContacts.filter((c) => c.name.trim() || c.phone.trim()) }
    setSaving(true)
    try {
      const saved = await saveProfile(cleaned)
      setProfile(saved)
      navigation.reset({ index: 0, routes: [{ name: 'App' }] })
    } catch (e) { setBanner(e.message || 'Could not save your profile. Please try again.') }
    finally { setSaving(false) }
  }

  const stepOptional = !REQUIRED_BY_STEP[current.key]

  const renderStep = () => {
    switch (current.key) {
      case 'name':
        return (
          <>
            <Field label="First name *" value={form.firstName} onChangeText={set('firstName')} error={errors.firstName ? 'Required' : undefined} autoFocus />
            <Field label="Middle name" value={form.middleName} onChangeText={set('middleName')} placeholder="Optional" />
            <Field label="Last name" value={form.lastName} onChangeText={set('lastName')} placeholder="Optional" />
          </>
        )
      case 'gender':
        return <SelectModal label="Gender *" value={form.gender} options={GENDERS} onChange={set('gender')} placeholder="Select gender" />
      case 'dob':
        return <DateWheels value={form.dob} onChange={set('dob')} minYear={1947} />
      case 'phone':
        return (
          <View style={styles.phoneRow}>
            <CountryPicker value={country} onChange={setCountry} />
            <View style={styles.phoneInputWrap}>
              <TextInput style={styles.phoneInput} value={localPhone} onChangeText={(t) => setLocalPhone(t.replace(/[^\d]/g, ''))} placeholder="Phone number" placeholderTextColor={colors.muted} keyboardType="phone-pad" />
            </View>
          </View>
        )
      case 'email':
        return (
          <>
            <Field label="Email *" value={form.email} onChangeText={set('email')} keyboardType="email-address" autoCapitalize="none" error={errors.email ? 'Required' : undefined} />
            <SelectModal label="Preferred language" value={form.preferredLanguage} options={LANGS} onChange={set('preferredLanguage')} searchable />
          </>
        )
      case 'medical':
        return (
          <>
            <SelectModal label="Blood group *" value={form.bloodGroup} options={BLOOD} onChange={set('bloodGroup')} placeholder="Select blood group" />
            <Field label="Allergies" value={form.allergies} onChangeText={set('allergies')} multiline placeholder="e.g. Penicillin, peanuts — or 'None'" />
            <Field label="Medical conditions" value={form.conditions} onChangeText={set('conditions')} multiline placeholder="e.g. Asthma, diabetes — or 'None'" />
            <Field label="Disability" value={form.disability} onChangeText={set('disability')} multiline placeholder="Anything we should know — or 'None'" />
            <YesNo label="Do you smoke?" value={form.smoker} onSelect={set('smoker')} />
            <YesNo label="History of heart issues?" value={form.heartHistory} onSelect={set('heartHistory')} />
            <Field label="Insurance provider" value={form.insurance.provider} onChangeText={setIns('provider')} placeholder="e.g. LIC, HDFC Ergo" />
            <Field label="Policy number" value={form.insurance.policyNumber} onChangeText={setIns('policyNumber')} placeholder="Optional" />
            <Field label="Policy holder" value={form.insurance.policyHolder} onChangeText={setIns('policyHolder')} placeholder="Name on card" />
            <Field label="Insurance helpline" value={form.insurance.helpline} onChangeText={setIns('helpline')} keyboardType="phone-pad" placeholder="Emergency support #" />
          </>
        )
      case 'contacts':
        return (
          <>
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
      default:
        return null
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {/* Header: category chips (green ✓ once passed) + segmented progress */}
        <View style={styles.header}>
          <View style={styles.cats}>
            {CATS.map(({ key, Icon }) => {
              const done = step > catLastIndex(key)
              const active = current.cat === key
              return (
                <TouchableOpacity key={key} style={[styles.cat, active && styles.catActive, done && styles.catDone]} onPress={() => gotoCat(key)} activeOpacity={done ? 0.7 : 1}>
                  <View style={[styles.catDot, active && styles.catDotActive, done && styles.catDotDone]}>
                    {done ? <Check size={13} color="#fff" /> : <Icon size={14} color={active ? '#fff' : colors.muted} />}
                  </View>
                  <Text style={[styles.catLabel, active && { color: colors.primary }, done && { color: colors.success }]} numberOfLines={1}>{key}</Text>
                </TouchableOpacity>
              )
            })}
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <Animated.View style={{ opacity, transform: [{ translateX: slide }] }}>
            <Text style={styles.qTitle}>{current.title}</Text>
            <Text style={styles.qSub}>{current.sub}</Text>
            {!!banner && <View style={styles.errBanner}><AlertCircle size={15} color={colors.primary} /><Text style={styles.errBannerText}>{banner}</Text></View>}
            <View style={styles.stepBody}>{renderStep()}</View>
          </Animated.View>
        </ScrollView>

        {/* Floating footer: Back (left) · Skip + "›" next (bottom right) */}
        <View style={styles.footer} pointerEvents="box-none">
          <View>
            {step > 0 && (
              <TouchableOpacity style={styles.backBtn} onPress={back} disabled={saving}><ArrowLeft size={16} color={colors.textSecondary} /><Text style={styles.backText}>Back</Text></TouchableOpacity>
            )}
          </View>
          <View style={styles.footerRight}>
            {stepOptional && !isLast && <TouchableOpacity style={styles.skipBtn} onPress={skip} disabled={saving}><Text style={styles.skipText}>Skip</Text></TouchableOpacity>}
            <TouchableOpacity style={styles.nextBtn} onPress={advance} disabled={saving} activeOpacity={0.85}>
              {saving ? <ActivityIndicator color="#fff" /> : isLast ? <Check size={22} color="#fff" /> : <ArrowRight size={24} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  )
}

const makeStyles = (colors) => StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: { paddingHorizontal: 18, paddingTop: 10, paddingBottom: 12, backgroundColor: colors.surface, borderBottomColor: colors.border, borderBottomWidth: 1 },
  cats: { flexDirection: 'row', gap: 8 },
  cat: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 7, paddingVertical: 8, paddingHorizontal: 8, borderRadius: 10, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.surface },
  catActive: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  catDone: { borderColor: colors.success },
  catDot: { width: 24, height: 24, borderRadius: 12, backgroundColor: colors.surface2, alignItems: 'center', justifyContent: 'center' },
  catDotActive: { backgroundColor: colors.primary },
  catDotDone: { backgroundColor: colors.success },
  catLabel: { fontSize: 12, fontWeight: '700', color: colors.textSecondary, flexShrink: 1 },
  scroll: { padding: 22, paddingBottom: 120, flexGrow: 1 },
  qTitle: { fontSize: 26, fontWeight: '800', color: colors.text, letterSpacing: -0.3 },
  qSub: { color: colors.muted, marginTop: 8, fontSize: 15, lineHeight: 21 },
  errBanner: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.primarySoft, borderColor: colors.primaryBorder, borderWidth: 1, borderRadius: radius.md, padding: 11, marginTop: 14 },
  errBannerText: { color: colors.primary, fontSize: 13, flex: 1 },
  stepBody: { marginTop: 10 },
  phoneRow: { flexDirection: 'row', gap: 10, marginTop: 16, alignItems: 'stretch' },
  phoneInputWrap: { flex: 1 },
  phoneInput: { flex: 1, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: 14, paddingVertical: 12, fontSize: 16, color: colors.text, backgroundColor: colors.surface },
  contact: { borderWidth: 1, borderColor: colors.border, borderRadius: radius.lg, padding: 14, marginTop: 14, backgroundColor: colors.surface },
  contactHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  contactTitle: { fontWeight: '700', color: colors.textSecondary },
  remove: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  removeText: { color: colors.muted, fontSize: 12 },
  addBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed', borderRadius: radius.md, paddingVertical: 10, paddingHorizontal: 14, marginTop: 14 },
  addText: { color: colors.primary, fontWeight: '600' },
  footer: { position: 'absolute', left: 0, right: 0, bottom: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 12, paddingBottom: 18 },
  backBtn: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  backText: { color: colors.textSecondary, fontWeight: '700' },
  footerRight: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  skipBtn: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: radius.md, backgroundColor: colors.surface, borderWidth: 1, borderColor: colors.border },
  skipText: { color: colors.muted, fontWeight: '700', fontSize: 15 },
  nextBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.primary, alignItems: 'center', justifyContent: 'center', shadowColor: colors.primary, shadowOpacity: 0.35, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 6 },
})
