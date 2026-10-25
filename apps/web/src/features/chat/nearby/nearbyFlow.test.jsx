// @vitest-environment jsdom
// Nearby care end to end in the dashboard: a reply at risk >= 65 adds the card by
// itself, below 65 it doesn't; the sidebar button uses the chat's latest
// assessment; errors can be retried; the chat page places each card after its
// assessment; the map draws the places.
import { act, cleanup, render, renderHook, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Outlet, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui'

const chat = vi.hoisted(() => ({
  listConsultations: vi.fn(), createConsultation: vi.fn(), getMessages: vi.fn(), deleteConsultation: vi.fn(),
  unsendMessage: vi.fn(), renameConsultation: vi.fn(), sendMessage: vi.fn(), setMessageFeedback: vi.fn(),
  fetchTts: vi.fn(), translateMessage: vi.fn(),
}))
const near = vi.hoisted(() => ({ getPosition: vi.fn(), findNearbyCare: vi.fn() }))
const leaflet = vi.hoisted(() => {
  const map = { attributionControl: { setPrefix: vi.fn() }, fitBounds: vi.fn(), remove: vi.fn() }
  const layer = () => { const l = { addTo: vi.fn(() => l), bindTooltip: vi.fn(() => l) }; return l }
  return { map, L: { map: vi.fn(() => map), tileLayer: vi.fn(layer), marker: vi.fn(layer), divIcon: vi.fn((o) => o), latLngBounds: vi.fn((b) => b) } }
})

vi.mock('../services/chatApi', () => chat)
vi.mock('./nearbyCare', async (orig) => ({ ...(await orig()), getPosition: near.getPosition, findNearbyCare: near.findNearbyCare }))
vi.mock('../../profile/context/ProfileContext.jsx', () => ({ useProfile: () => ({ profile: { firstName: 'A' }, loading: false, error: null, refresh: vi.fn() }) }))
vi.mock('../../../context/AuthContext.jsx', () => ({ useAuth: () => ({ signOut: vi.fn() }) }))
vi.mock('../../../services/uploads', () => ({ uploadFile: vi.fn(), listUploads: vi.fn(async () => []) }))
vi.mock('../voice/useVoiceInput', () => ({ useVoiceInput: () => ({ state: 'idle' }) }))
vi.mock('leaflet', () => leaflet.L)
vi.mock('leaflet/dist/leaflet.css', () => ({}))

import { useDashboard } from '../../dashboard/useDashboard'
import ChatPage from '../../dashboard/pages/ChatPage.jsx'
import NearbyMap from './NearbyMap.jsx'

const reply = (id, riskScore, care) => ({
  id, role: 'assistant', createdAt: '2026-10-25T10:00:00Z',
  content: JSON.stringify({ severity: riskScore >= 70 ? 'HIGH' : 'LOW', riskScore, advice: 'x', ...(care && { care }), triage: { v: 3, mode: 'final' } }),
})
const PLACES = { issue: 'Migraine', specialty: 'neurology', specialtyLabel: 'Brain & nerves (Neurology)', searchTerm: 'neurologist', severity: 'HIGH', radiusKm: 5, source: 'Amazon Location Service', places: [] }
const wrapper = ({ children }) => <MemoryRouter><ToastProvider>{children}</ToastProvider></MemoryRouter>

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true })))
  chat.listConsultations.mockResolvedValue([])
  chat.createConsultation.mockResolvedValue({ consultationId: 'c1' })
  near.getPosition.mockResolvedValue({ lat: 12.9, lng: 77.6 })
  near.findNearbyCare.mockResolvedValue(PLACES)
})
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })

describe('useDashboard nearby care', () => {
  it('risk >= 65 adds the card by itself, with the reply’s care focus', async () => {
    const { result } = renderHook(() => useDashboard(), { wrapper })
    await waitFor(() => expect(result.current.initialLoading).toBe(false))
    chat.sendMessage.mockResolvedValueOnce({ assistantMessage: reply('a1', 72, { issue: 'Migraine', specialty: 'neurology' }) })
    await act(async () => { await result.current.sendQuick('headache') })
    await waitFor(() => expect(result.current.nearby['after:a1']?.status).toBe('ready'))
    expect(near.findNearbyCare).toHaveBeenCalledWith({ lat: 12.9, lng: 77.6, severity: 'HIGH', specialty: 'neurology', issue: 'Migraine' })
    expect(result.current.nearby['after:a1']).toMatchObject({ cid: 'c1', afterId: 'a1', data: PLACES, position: { lat: 12.9, lng: 77.6 } })
  })

  it('risk < 65 waits for the button; the sidebar button uses the latest assessment (by consultation when it has no care)', async () => {
    const { result } = renderHook(() => useDashboard(), { wrapper })
    await waitFor(() => expect(result.current.initialLoading).toBe(false))
    chat.sendMessage.mockResolvedValueOnce({ assistantMessage: reply('a2', 22) })
    await act(async () => { await result.current.sendQuick('ankle') })
    expect(result.current.nearby).toEqual({})
    await act(async () => { result.current.handleFindHospitals() })
    await waitFor(() => expect(result.current.nearby['after:a2']?.status).toBe('ready'))
    expect(near.findNearbyCare).toHaveBeenCalledWith({ lat: 12.9, lng: 77.6, severity: 'LOW', consultationId: 'c1', messageId: 'a2' })
  })

  it('no chat yet: plain search at the end; errors are kept and can be retried', async () => {
    const { result } = renderHook(() => useDashboard(), { wrapper })
    await waitFor(() => expect(result.current.initialLoading).toBe(false))
    near.getPosition.mockRejectedValueOnce(Object.assign(new Error('x'), { kind: 'denied' }))
    await act(async () => { result.current.handleFindHospitals() })
    await waitFor(() => expect(result.current.nearby['end:new']).toMatchObject({ status: 'error', error: 'denied', afterId: null }))
    near.findNearbyCare.mockRejectedValueOnce(new Error('503'))
    await act(async () => { result.current.retryNearby('end:new') })
    await waitFor(() => expect(result.current.nearby['end:new']).toMatchObject({ status: 'error', error: 'service' }))
    await act(async () => { result.current.retryNearby('end:new') })
    await waitFor(() => expect(result.current.nearby['end:new'].status).toBe('ready'))
    expect(near.findNearbyCare).toHaveBeenLastCalledWith({ lat: 12.9, lng: 77.6 })
  })
})

describe('chat page placement', () => {
  const base = {
    messages: [], isLoading: false, chatAttachmentMap: {}, activeId: 'c1', nearby: {}, firstName: 'A',
    startDraft: vi.fn(), loadConsultations: vi.fn(), selectConsultation: vi.fn(), retrySend: vi.fn(), reloadChats: vi.fn(),
    sendQuick: vi.fn(), setInput: vi.fn(), handleFindHospitals: vi.fn(), unsendMessageById: vi.fn(), dismissError: vi.fn(),
    submitFeedback: vi.fn(), submitFeedbackDetail: vi.fn(), sendAnswers: vi.fn(), showNearbyCare: vi.fn(), retryNearby: vi.fn(),
    input: '', handleSend: vi.fn(), voice: { state: 'idle' }, attachments: [], removeAttachment: vi.fn(), refs: {},
    docInputRef: { current: null }, photoInputRef: { current: null }, setAnalysisOpen: vi.fn(), analysisOpen: false,
  }
  const page = (d) => render(
    <MemoryRouter><ToastProvider><Routes><Route element={<Outlet context={d} />}><Route path="/" element={<ChatPage />} /></Route></Routes></ToastProvider></MemoryRouter>,
  )
  const bubble = (id, risk) => ({ id, sender: 'bot', text: 'x', severity: 'LOW', riskScore: risk, raw: reply(id, risk).content, createdAt: '2026-10-25T10:00:00Z' })

  it('a card follows its assessment; other assessments keep the button; other chats’ cards are hidden', () => {
    window.HTMLElement.prototype.scrollTo = vi.fn()
    const d = {
      ...base,
      messages: [{ id: 'u1', sender: 'user', text: 'hi', createdAt: '2026-10-25T10:00:00Z', status: 'received' }, bubble('b1', 22), bubble('b2', 30)],
      nearby: {
        'after:b1': { key: 'after:b1', cid: 'c1', afterId: 'b1', status: 'searching', at: '2026-10-25T10:00:00Z' },
        'end:c9': { key: 'end:c9', cid: 'c9', afterId: null, status: 'locating', at: '2026-10-25T10:00:00Z' },
      },
    }
    page(d)
    const cards = screen.getAllByRole('article', { name: 'Nearby hospitals and clinics' })
    expect(cards).toHaveLength(1)
    const order = [...document.querySelectorAll('article')].map((a) => a.getAttribute('aria-label'))
    expect(order).toEqual(['SankatAI assessment', 'Nearby hospitals and clinics', 'SankatAI assessment'])
    expect(screen.getAllByRole('button', { name: 'Show nearby hospitals for this issue' })).toHaveLength(1)
    screen.getByRole('button', { name: 'Show nearby hospitals for this issue' }).click()
    expect(d.showNearbyCare).toHaveBeenCalledWith({ cid: 'c1', anchor: d.messages[2] })
  })

  it('an empty chat with a card shows the card instead of the welcome', () => {
    page({ ...base, nearby: { 'end:c1': { key: 'end:c1', cid: 'c1', afterId: null, status: 'error', error: 'service', at: '2026-10-25T10:00:00Z' } } })
    expect(screen.queryByText(/What would you like help with today/)).toBeNull()
    screen.getByRole('button', { name: 'Try again' }).click()
    expect(base.retryNearby).toHaveBeenCalledWith('end:c1')
  })
})

describe('map', () => {
  it('draws you and the numbered places (names as text), fits them, and cleans up', async () => {
    const places = [{ name: '<b>Clinic</b>', lat: 1, lng: 2 }, { name: 'Hospital', lat: 3, lng: 4 }]
    const { unmount } = render(<NearbyMap origin={{ lat: 0, lng: 0 }} places={places} />)
    await waitFor(() => expect(leaflet.map.fitBounds).toHaveBeenCalled())
    expect(screen.getByRole('region').getAttribute('aria-label')).toBe('Map of your location and 2 nearby places')
    expect(leaflet.L.marker).toHaveBeenCalledTimes(3)
    const tip = leaflet.L.marker.mock.results[1].value.bindTooltip.mock.calls[0][0]
    expect(tip.textContent).toBe('<b>Clinic</b>') // never parsed as HTML
    expect(leaflet.L.latLngBounds).toHaveBeenCalledWith([[0, 0], [1, 2], [3, 4]])
    unmount()
    expect(leaflet.map.remove).toHaveBeenCalled()
  })
})
