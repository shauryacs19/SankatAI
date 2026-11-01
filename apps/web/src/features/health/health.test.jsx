// @vitest-environment jsdom
// Health records: symptom tracker, report analyzer, timeline filters, and the
// red-flag emergency panel.
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../components/ui'

vi.mock('./services/healthApi', () => ({
  listSymptoms: vi.fn(), addSymptom: vi.fn(), deleteSymptom: vi.fn(), summarizeSymptom: vi.fn(),
  listReports: vi.fn(), getReport: vi.fn(), analyzeReport: vi.fn(), getTimeline: vi.fn(),
  getDoctorReportPdf: vi.fn(), getSelectionReportPdf: vi.fn(),
}))
vi.mock('react-router-dom', async (orig) => ({ ...(await orig()), useOutletContext: () => ({ selectConsultation: vi.fn() }) }))

import * as api from './services/healthApi'
import SymptomTracker from './components/SymptomTracker.jsx'
import ReportAnalyzer from './components/ReportAnalyzer.jsx'
import TimelineView from './components/TimelineView.jsx'
import DoctorReportModal from './components/DoctorReport.jsx'
import EmergencyPanel from '../emergency/components/EmergencyPanel.jsx'
import { toBubble } from '../chat/utils/format.jsx'

const wrap = (ui) => render(<MemoryRouter><ToastProvider>{ui}</ToastProvider></MemoryRouter>)
afterEach(() => { cleanup(); vi.clearAllMocks() })

const entries = [
  { id: 'e1', name: 'Headache', severity: 3, recordedAt: '2026-10-28T09:00:00Z', notes: '' },
  { id: 'e2', name: 'Headache', severity: 7, recordedAt: '2026-10-30T09:00:00Z', notes: 'after work' },
]
const symptoms = { entries: [...entries].reverse(), symptoms: [{ name: 'Headache', entries, trend: { count: 2, first: 3, latest: 7, change: 4, direction: 'increasing', firstAt: entries[0].recordedAt, latestAt: entries[1].recordedAt } }] }

describe('symptom tracker', () => {
  it('shows the trend, chart and entries, and records a new entry', async () => {
    api.listSymptoms.mockResolvedValue(symptoms)
    api.addSymptom.mockResolvedValue({})
    wrap(<SymptomTracker />)
    expect(await screen.findByText('Ratings increasing')).toBeTruthy()
    expect(screen.getByRole('img', { name: /Headache severity over time, 2 entries, latest 7/ })).toBeTruthy()
    expect(screen.getByText(/after work/)).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    expect(await screen.findByText(/Enter the symptom/)).toBeTruthy()
    expect(api.addSymptom).not.toHaveBeenCalled()

    fireEvent.change(screen.getByLabelText(/Symptom/), { target: { value: ' Cough ' } })
    fireEvent.change(screen.getByLabelText(/Severity/), { target: { value: '9' } })
    expect(screen.getByText(/call 112/)).toBeTruthy() // severe rating: emergency hint
    fireEvent.click(screen.getByRole('button', { name: 'Add entry' }))
    await waitFor(() => expect(api.addSymptom).toHaveBeenCalled())
    expect(api.addSymptom.mock.calls[0][0]).toMatchObject({ name: 'Cough', severity: 9, notes: '' })
  })

  it('shows the empty state', async () => {
    api.listSymptoms.mockResolvedValue({ entries: [], symptoms: [] })
    wrap(<SymptomTracker />)
    expect(await screen.findByText('No symptoms recorded yet')).toBeTruthy()
  })
})

describe('report analyzer', () => {
  it('lists documents and shows an analysis with printed ranges and flags', async () => {
    api.listReports.mockResolvedValue({ reports: [
      { attachmentId: 'd1', filename: 'cbc.pdf', status: 'ready', abnormalCount: 1, uploadedAt: '2026-10-30T10:00:00Z' },
      { attachmentId: 'd2', filename: 'xray.pdf', status: 'none', uploadedAt: '2026-10-29T10:00:00Z' },
    ] })
    api.getReport.mockResolvedValue({
      attachmentId: 'd1', filename: 'cbc.pdf', status: 'ready', analyzedAt: '2026-10-30T10:01:00Z', disclaimer: 'Not a diagnosis.',
      analysis: { summary: 'Blood count.', verifiedAgainstText: true, medications: [], parameters: [
        { name: 'WBC', value: '7.5', unit: '10^3/uL', referenceRange: '4.0 - 11.0', status: 'normal', explanation: '' },
        { name: 'Haemoglobin', value: '10.2', unit: 'g/dL', referenceRange: '13.0 - 17.0', status: 'low', explanation: 'Carries oxygen.' },
        { name: 'Vitamin D', value: '18', unit: 'ng/mL', referenceRange: null, status: 'not_assessed', explanation: '' },
      ] },
    })
    wrap(<ReportAnalyzer />)
    expect(await screen.findByText('1 outside range')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'View' }))
    const rows = await screen.findAllByRole('row')
    expect(rows[1].textContent).toContain('Haemoglobin') // abnormal first
    expect(rows[1].textContent).toContain('Low')
    expect(screen.getByText('Not stated in report')).toBeTruthy()
    expect(screen.getByText('Not a diagnosis.')).toBeTruthy()

    api.analyzeReport.mockResolvedValue({ attachmentId: 'd2', status: 'processing' })
    fireEvent.click(screen.getByRole('button', { name: 'Analyse' }))
    await waitFor(() => expect(api.analyzeReport).toHaveBeenCalledWith('d2'))
    expect(await screen.findByText('Analysing…')).toBeTruthy()
  })
})

describe('timeline canvas', () => {
  const events = [
    { id: 's-1', category: 'symptom', title: 'Headache: 7/10', at: '2026-10-30T09:00:00Z', details: { name: 'Headache', severity: 7, notes: 'after work' } },
    { id: 's-2', category: 'symptom', title: 'Headache: 5/10', at: '2026-10-30T18:00:00Z', details: { name: 'Headache', severity: 5, notes: '' } },
    { id: 'c-1', category: 'assessment', title: 'Fever', at: '2026-10-29T09:00:00Z', severity: 'MODERATE', details: { consultationId: 'c1' } },
    { id: 'c-0', category: 'assessment', title: 'Cough', at: '2026-10-20T09:00:00Z', severity: 'LOW', details: { consultationId: 'c0' } },
  ]
  const cardOf = (title) => screen.getByRole('button', { name: title }).closest('.fc-node')
  const px = (v) => Number.parseFloat(v)

  it('stacks weeks top to bottom with weekday columns and a downward arrow between weeks', async () => {
    try { localStorage.clear() } catch { /* jsdom */ }
    api.getTimeline.mockResolvedValue({ events })
    wrap(<TimelineView onOpenReport={() => {}} />)
    await screen.findByRole('button', { name: 'Fever' })
    const weeks = [...document.querySelectorAll('.fc-week-title')].map((n) => n.textContent)
    expect(weeks).toHaveLength(2)
    expect(weeks[0]).toMatch(/19 Oct/) // oldest week on top
    expect(px(cardOf('Fever').style.top)).toBeGreaterThan(px(cardOf('Cough').style.top))
    // Same weekday column in both weeks lines up; same-day events stack.
    expect(cardOf('Headache: 7/10').style.left).toBe(cardOf('Headache: 5/10').style.left)
    expect(px(cardOf('Headache: 5/10').style.top)).toBeGreaterThan(px(cardOf('Headache: 7/10').style.top))
    const wires = [...document.querySelectorAll('.fc-wire')].map((w) => w.getAttribute('d'))
    expect(wires).toHaveLength(4) // 3 links + the NOW link
    expect(wires[0]).toMatch(/^M[\d.-]+,[\d.-]+ V[\d.-]+ H/) // Cough -> Fever: down, across, down
  })

  it('selects, filters, zooms and moves cards', async () => {
    try { localStorage.clear() } catch { /* jsdom */ }
    api.getTimeline.mockResolvedValue({ events })
    wrap(<TimelineView onOpenReport={() => {}} />)
    await screen.findByRole('button', { name: 'Fever' })

    fireEvent.click(screen.getByRole('button', { name: 'Headache: 7/10' }))
    expect(screen.getByRole('complementary', { name: 'Event details' }).textContent).toContain('after work')

    fireEvent.click(screen.getByRole('button', { name: 'Symptoms', pressed: true }))
    expect(screen.queryByRole('button', { name: 'Headache: 7/10' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Symptoms', pressed: false }))

    const zoom = () => document.querySelector('.fc-zoomlabel').textContent
    const before = zoom()
    fireEvent.click(screen.getByRole('button', { name: 'Zoom in' }))
    expect(zoom()).not.toBe(before)

    const left = cardOf('Fever').style.left
    fireEvent.pointerDown(cardOf('Fever'), { pointerId: 1, clientX: 10, clientY: 10, button: 0 })
    fireEvent.pointerMove(document.querySelector('.fc'), { pointerId: 1, clientX: 110, clientY: 60 })
    fireEvent.pointerUp(document.querySelector('.fc'), { pointerId: 1, clientX: 110, clientY: 60 })
    expect(cardOf('Fever').style.left).not.toBe(left)
    fireEvent.click(screen.getByRole('button', { name: 'Reset layout' }))
    expect(cardOf('Fever').style.left).toBe(left)
    try { localStorage.clear() } catch { /* jsdom */ }
  })
})

describe('timeline selection -> doctor report', () => {
  const events = [
    { id: 's-1', category: 'symptom', title: 'Headache: 7/10', at: '2026-10-30T09:00:00Z', details: { name: 'Headache', severity: 7, notes: '' } },
    { id: 'c-1', category: 'assessment', title: 'Fever', at: '2026-10-29T09:00:00Z', severity: 'MODERATE', details: { consultationId: 'c1' } },
    { id: 'c-0', category: 'assessment', title: 'Cough', at: '2026-10-20T09:00:00Z', severity: 'LOW', details: { consultationId: 'c0' } },
  ]

  it('ticks a whole week or single records and builds the report from exactly those', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:sel')
    URL.revokeObjectURL = vi.fn()
    api.getTimeline.mockResolvedValue({ events })
    api.getSelectionReportPdf.mockResolvedValue(new Blob(['%PDF']))
    wrap(<TimelineView onOpenReport={() => {}} />)
    await screen.findByRole('button', { name: 'Fever' })
    const generate = screen.getByRole('button', { name: /Generate doctor report/ })
    expect(generate.disabled).toBe(true)

    const weekBoxes = screen.getAllByRole('checkbox', { name: /Select every record in the week/ })
    fireEvent.click(weekBoxes[1]) // the week of 26 Oct: Fever + Headache
    expect(weekBoxes[1].getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText('2 records selected')).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /Include “Headache: 7\/10”/ }))
    expect(weekBoxes[1].getAttribute('aria-checked')).toBe('mixed')
    fireEvent.click(screen.getByRole('checkbox', { name: /Include “Cough”/ }))
    expect(screen.getByText('2 records selected')).toBeTruthy()

    fireEvent.click(generate)
    await waitFor(() => expect(api.getSelectionReportPdf).toHaveBeenCalled())
    expect([...api.getSelectionReportPdf.mock.calls[0][0]].sort()).toEqual(['c-0', 'c-1'])
    expect(screen.getByText(/Only the records you selected: 2 selected records/)).toBeTruthy()
    expect((await screen.findByTitle('Doctor report preview')).getAttribute('src')).toBe('blob:sel')
  })
})

describe('doctor report (per chat)', () => {
  it('builds the PDF for the given chat and offers preview + download', async () => {
    URL.createObjectURL = vi.fn(() => 'blob:report')
    URL.revokeObjectURL = vi.fn()
    api.getDoctorReportPdf.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }))
    wrap(<DoctorReportModal source={{ kind: 'chat', consultationId: 'c9', title: 'Belly pain' }} onClose={() => {}} />)
    expect(api.getDoctorReportPdf).toHaveBeenCalledWith('c9')
    expect(screen.getByText(/For this chat only: “Belly pain”/)).toBeTruthy()
    expect((await screen.findByTitle('Doctor report preview')).getAttribute('src')).toBe('blob:report')
    expect(screen.getByRole('link', { name: /Download PDF/ }).getAttribute('download')).toBe('sankatai-doctor-report.pdf')
  })

  it('shows an error with a retry', async () => {
    api.getDoctorReportPdf.mockRejectedValueOnce(new Error('Chat not found.')).mockResolvedValueOnce(new Blob(['%PDF']))
    URL.createObjectURL = vi.fn(() => 'blob:again')
    wrap(<DoctorReportModal source={{ kind: 'chat', consultationId: 'c9', title: 'x' }} onClose={() => {}} />)
    expect(await screen.findByText('Chat not found.')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Try again/ }))
    expect((await screen.findByTitle('Doctor report preview')).getAttribute('src')).toBe('blob:again')
  })
})

describe('emergency red flags', () => {
  it('carries the backend emergency block into the bubble', () => {
    const content = JSON.stringify({ severity: 'EMERGENCY', advice: 'Call 112 now.', emergency: { detected: true, source: 'rules', reasons: ['chest pain or pressure'] } })
    expect(toBubble({ id: 'm', role: 'assistant', content }).emergency.reasons).toEqual(['chest pain or pressure'])
  })

  it('shows the warning signs, 112 first, and the no-rule-out note', () => {
    render(<EmergencyPanel fromAssessment reasons={['chest pain or pressure']} riskScore={95} primaryContact={{ name: 'Asha', phone: '+919999999999' }} onShareLocation={() => {}} onFindHospitals={() => {}} onDismiss={() => {}} />)
    expect(screen.getByText(/Warning signs found: chest pain or pressure/)).toBeTruthy()
    const calls = screen.getAllByRole('link').map((a) => a.getAttribute('href'))
    expect(calls.slice(0, 3)).toEqual(['tel:112', 'tel:108', 'tel:+919999999999'])
    expect(screen.getByText(/cannot rule out an emergency/)).toBeTruthy()
  })
})
