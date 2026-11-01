// Health records API (backend routes/health_records.py). All calls are
// Cognito-authenticated and scoped to the signed-in user by the backend.
import { request } from '../../../services/api/httpClient'

const id = (v) => encodeURIComponent(v)

export const listSymptoms = () => request('/symptoms')
export const addSymptom = (body) => request('/symptoms', { method: 'POST', body })
export const deleteSymptom = (symptomId) => request(`/symptoms/${id(symptomId)}`, { method: 'DELETE' })
export const summarizeSymptom = (name) => request('/symptoms/summary', { method: 'POST', body: { name } })

export const listReports = () => request('/reports')
export const getReport = (attachmentId) => request(`/reports/${id(attachmentId)}`)
export const analyzeReport = (attachmentId) => request(`/reports/${id(attachmentId)}/analyze`, { method: 'POST' })

export const getTimeline = (categories) => request(`/timeline${categories?.length ? `?category=${categories.join(',')}` : ''}`)

// Doctor report for ONE chat (consultation).
export const getDoctorReportPdf = (consultationId) => request(`/consultations/${id(consultationId)}/doctor-report/pdf`, { responseType: 'blob' })
// Doctor report for the timeline records picked (event ids).
export const getSelectionReportPdf = (ids) => request('/doctor-report/selection', { method: 'POST', body: { ids }, responseType: 'blob' })
