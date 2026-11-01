// Doctor report for ONE chat, as a full-screen sheet: a native preview of what
// the report says, then "Download PDF" saves the server-built PDF (Android).
// Opened from the chat header or a History row.
import { useEffect, useState } from 'react'
import { ActivityIndicator, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { Download, Stethoscope, X } from 'lucide-react-native'
import { useToast } from '../../components/Toast'
import { errText } from '../../lib/errText'
import { getDoctorReport, saveDoctorReportPdf } from '../../lib/health'
import { ErrorBox, Loading, useStyles } from './parts'

const AI_LABEL = 'AI-generated informational summary — not a confirmed diagnosis.'

function Section({ title, ai, children }) {
  const { styles } = useStyles()
  return (
    <View style={{ gap: 4 }}>
      <Text style={[styles.rowTitle, { fontSize: 15 }]}>{title}</Text>
      {ai && <Text style={styles.note}>{AI_LABEL}</Text>}
      {children}
    </View>
  )
}

function Preview({ data }) {
  const { styles } = useStyles()
  const p = data.patient
  const h = data.history
  const line = (t, k) => <Text key={k} style={styles.text}>{t}</Text>
  return (
    <View style={[styles.card, { gap: 14 }]}>
      <Text style={styles.note}>Generated {data.generatedAt}. Covers this one consultation; not reviewed by a clinician.</Text>
      <Section title="Patient information">
        {line(`Name: ${p.name}`)}
        {line(`Age: ${p.age ?? 'Not provided'} · Sex: ${p.gender || 'Not provided'} · Blood group: ${p.bloodGroup || 'Not provided'}`)}
      </Section>
      <Section title="Medical history">
        {line(`Known conditions: ${h.conditions || 'None recorded'}`)}
        {!!h.disability && line(`Disability: ${h.disability}`)}
        {line(`Smoker: ${h.smoker || 'Not recorded'} · Heart history: ${h.heartHistory || 'Not recorded'}`)}
      </Section>
      <Section title="Allergies and medications">
        {line(`Allergies: ${data.allergies || 'None recorded'}`)}
        {data.medications.length ? data.medications.map((m, i) => line(`•  ${m} (from an uploaded document)`, i)) : line('Medications: none recorded')}
      </Section>
      {data.chats.map((c, ci) => (
        <View key={ci} style={{ gap: 14 }}>
          <Section title="Symptoms reported in this chat">
            {!!c.duration && line(`Duration mentioned: ${c.duration}`)}
            {c.reported.map((r, i) => line(`•  ${r}`, `r${i}`))}
            {c.answers.map((a, i) => line(`•  ${a.question} — ${a.answer}`, `a${i}`))}
            {!c.reported.length && !c.answers.length && <Text style={styles.muted}>No symptoms were described in this chat.</Text>}
          </Section>
          <Section title="AI triage assessment" ai>
            {c.assessments.length ? c.assessments.map((a, i) => (
              <View key={i} style={{ gap: 2 }}>
                <Text style={[styles.text, { fontWeight: '600' }]}>{a.date} UTC · rated {a.severity.toLowerCase()}</Text>
                {a.emergencyReasons.length > 0 && <Text style={styles.errorText}>Emergency warning signs: {a.emergencyReasons.join(', ')}</Text>}
                {!!a.summary && <Text style={styles.muted}>{a.summary}</Text>}
                {a.likelyCauses.length > 0 && <Text style={styles.muted}>Possible causes (not confirmed): {a.likelyCauses.join(', ')}</Text>}
              </View>
            )) : <Text style={styles.muted}>This chat has no AI assessment yet.</Text>}
          </Section>
        </View>
      ))}
      <Section title="Questions to discuss with the doctor">
        {data.questions.map((q, i) => line(`${i + 1}. ${q}`, i))}
      </Section>
    </View>
  )
}

export default function DoctorReportSheet({ chat, onClose }) {
  const { colors, styles } = useStyles()
  const toast = useToast()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let live = true
    getDoctorReport(chat.consultationId)
      .then((d) => { if (live) setData(d) })
      .catch((err) => { if (live) setError(errText(err, 'Could not generate the report.')) })
    return () => { live = false }
  }, [chat, attempt])

  const save = async () => {
    setSaving(true)
    try { if (await saveDoctorReportPdf(chat.consultationId)) toast.success('Doctor report PDF saved.') } catch (err) { toast.error(errText(err, 'Could not save the PDF.')) }
    setSaving(false)
  }

  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={styles.safe}>
        <View style={[styles.cardHead, { paddingHorizontal: 16, paddingVertical: 12 }]}>
          <Stethoscope size={18} color={colors.primary} />
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>Doctor report</Text>
            <Text style={styles.muted} numberOfLines={1}>For this chat only: {chat.title || 'New consultation'}</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={10} accessibilityLabel="Close doctor report"><X size={20} color={colors.muted} /></TouchableOpacity>
        </View>
        {error ? <ErrorBox message={error} onRetry={() => { setError(''); setAttempt((n) => n + 1) }} />
          : !data ? <Loading />
            : (
              <ScrollView contentContainerStyle={styles.scroll}>
                <TouchableOpacity style={[styles.primaryBtn, saving && { opacity: 0.6 }]} onPress={save} disabled={saving}>
                  {saving ? <ActivityIndicator color={colors.onPrimary} /> : <Download size={16} color={colors.onPrimary} />}
                  <Text style={styles.primaryText}>{saving ? 'Saving…' : 'Download PDF'}</Text>
                </TouchableOpacity>
                <Preview data={data} />
                <Text style={styles.note}>The report contains medical information. Share it only with people you trust.</Text>
              </ScrollView>
            )}
      </SafeAreaView>
    </Modal>
  )
}
