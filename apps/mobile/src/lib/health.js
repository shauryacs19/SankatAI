// Health records API (backend routes/health_records.py) — the same endpoints the
// web app uses: symptoms, report analyses, timeline, doctor report PDF.
import { Platform } from 'react-native'
import * as FileSystem from 'expo-file-system/legacy'
import { request } from './api'

const id = (v) => encodeURIComponent(v)

export const listSymptoms = () => request('/symptoms')
export const addSymptom = (body) => request('/symptoms', { method: 'POST', body })
export const deleteSymptom = (symptomId) => request(`/symptoms/${id(symptomId)}`, { method: 'DELETE' })
export const summarizeSymptom = (name) => request('/symptoms/summary', { method: 'POST', body: { name } }, 30000)

export const listReports = () => request('/reports')
export const getReport = (attachmentId) => request(`/reports/${id(attachmentId)}`)
export const analyzeReport = (attachmentId) => request(`/reports/${id(attachmentId)}/analyze`, { method: 'POST' })

export const getTimeline = (categories) => request(`/timeline${categories?.length ? `?category=${categories.join(',')}` : ''}`)
// Doctor report for ONE chat (consultation).
export const getDoctorReport = (consultationId) => request(`/consultations/${id(consultationId)}/doctor-report`, {}, 30000)

const blobToBase64 = (blob) => new Promise((resolve, reject) => {
  const reader = new FileReader()
  reader.onload = () => resolve(String(reader.result).split(',')[1] || '')
  reader.onerror = () => reject(new Error('Could not read the report.'))
  reader.readAsDataURL(blob)
})

// Saves the doctor report PDF into a folder the person picks (Android Storage
// Access Framework, no extra native module). Returns false if they cancelled.
export const saveDoctorReportPdf = async (consultationId) => {
  if (Platform.OS !== 'android') throw new Error('Saving the PDF is available on Android. On iPhone, download it from the SankatAI website.')
  const SAF = FileSystem.StorageAccessFramework
  const perm = await SAF.requestDirectoryPermissionsAsync()
  if (!perm.granted) return false
  const blob = await request(`/consultations/${id(consultationId)}/doctor-report/pdf`, { responseType: 'blob' }, 30000)
  const b64 = await blobToBase64(blob)
  const stamp = new Date().toISOString().slice(0, 10)
  const uri = await SAF.createFileAsync(perm.directoryUri, `sankatai-doctor-report-${stamp}`, 'application/pdf')
  await FileSystem.writeAsStringAsync(uri, b64, { encoding: FileSystem.EncodingType.Base64 })
  return true
}
