// @vitest-environment jsdom
// Nearby care: the in-chat message (top places, distances, links, map), its
// error states, the button on assessments, and the location helper.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ToastProvider } from '../../../components/ui'

vi.mock('./NearbyMap.jsx', () => ({ default: ({ places }) => <div data-testid="map">{places.length} pins</div> }))
vi.mock('../services/chatApi', () => ({ translateMessage: vi.fn(), fetchTts: vi.fn() }))

import { NearbyCareMessage } from './NearbyCareMessage.jsx'
import { AssistantMessage } from '../components/ChatMessages.jsx'
import { toBubble } from '../utils/format.jsx'
import { directionsUrl, formatKm, getPosition, mapsSearchUrl, resetPositionForTests } from './nearbyCare'

const data = {
  issue: 'Ankle sprain', specialty: 'orthopaedics', specialtyLabel: 'Bones & joints (Orthopaedics)', searchTerm: 'orthopaedic',
  severity: 'LOW', radiusKm: 5, source: 'Amazon Location Service',
  places: [
    { id: 'a', name: 'Bone & Joint Clinic', kind: 'clinic', lat: 12.98, lng: 77.6, distanceKm: 1.42, matchesSpecialty: true, emergency: null, address: 'MG Road', phone: '+91 80 1234 5678' },
    { id: 'b', name: 'City Hospital', kind: 'hospital', lat: 12.99, lng: 77.61, distanceKm: 0.34, matchesSpecialty: false, emergency: true, address: null, phone: null },
    { id: 'c', name: 'Family Clinic', kind: 'clinic', lat: 12.97, lng: 77.59, distanceKm: 12.6, matchesSpecialty: false, emergency: null, address: null, phone: null },
  ],
}
const position = { lat: 12.9756, lng: 77.605 }
const entry = (over) => ({ key: 'after:m1', cid: 'c1', afterId: 'm1', at: '2026-10-25T10:00:00Z', anchor: null, ...over })

afterEach(cleanup)

describe('nearby care message', () => {
  it('lists the top places with distance and type, links to Google Maps and shows the map', async () => {
    render(<NearbyCareMessage entry={entry({ status: 'ready', data, position })} onRetry={() => {}} />)
    expect(screen.getByText('Ankle sprain')).toBeTruthy()
    const items = screen.getAllByRole('listitem')
    expect(items.map((li) => li.querySelector('.nb-name').textContent)).toEqual(['Bone & Joint Clinic', 'City Hospital', 'Family Clinic'])
    expect(items[0].textContent).toContain('1.4 km')
    expect(items[1].textContent).toContain('340 m')
    expect(items[2].textContent).toContain('13 km')
    expect([...document.querySelectorAll('.nb-tag')].map((t) => t.textContent)).toEqual(['Orthopaedics', 'Emergency room']) // only the matching place is tagged
    expect(screen.getByText('Emergency room')).toBeTruthy()
    const directions = screen.getByRole('link', { name: 'Directions to Bone & Joint Clinic' })
    expect(directions.getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=12.98,77.6')
    expect(directions.getAttribute('target')).toBe('_blank')
    expect(screen.getByRole('link', { name: 'Call Bone & Joint Clinic' }).getAttribute('href')).toBe('tel:+918012345678')
    expect(screen.getByRole('link', { name: 'Open in Google Maps' }).getAttribute('href'))
      .toBe('https://www.google.com/maps/search/orthopaedic/@12.9756,77.605,14z')
    expect((await screen.findByTestId('map')).textContent).toBe('3 pins')
  })

  it('an emergency puts "call 108" first; no results says so', () => {
    render(<NearbyCareMessage entry={entry({ status: 'ready', data: { ...data, severity: 'EMERGENCY', places: [] }, position })} onRetry={() => {}} />)
    expect(screen.getByRole('link', { name: 'call 108' }).getAttribute('href')).toBe('tel:108')
    expect(screen.getByText(/couldn’t find a hospital or clinic within 5 km/)).toBeTruthy()
    expect(screen.queryByTestId('map')).toBeNull()
  })

  it('location off: explains, offers a retry and a Google Maps search for the issue', () => {
    const onRetry = vi.fn()
    render(<NearbyCareMessage entry={entry({ status: 'error', error: 'denied', anchor: { care: { specialty: 'cardiology' } } })} onRetry={onRetry} />)
    expect(screen.getByText(/Location access is off/)).toBeTruthy()
    expect(screen.getByRole('link', { name: 'Search on Google Maps' }).getAttribute('href'))
      .toBe('https://www.google.com/maps/search/cardiologist%20near%20me')
    fireEvent.click(screen.getByRole('button', { name: 'Try again' }))
    expect(onRetry).toHaveBeenCalled()
  })

  it('shows progress while locating and searching', () => {
    const { rerender } = render(<NearbyCareMessage entry={entry({ status: 'locating' })} onRetry={() => {}} />)
    expect(screen.getByRole('status').textContent).toContain('Finding your location')
    rerender(<NearbyCareMessage entry={entry({ status: 'searching', position })} onRetry={() => {}} />)
    expect(screen.getByRole('status').textContent).toContain('Finding hospitals and clinics near you')
  })
})

describe('assessment button', () => {
  const reply = { severity: 'LOW', riskScore: 22, advice: 'Rest it.', seekCare: 'Self-care', care: { issue: 'Ankle sprain', specialty: 'orthopaedics' }, triage: { v: 3, mode: 'final' } }
  const m = toBubble({ id: 'm1', role: 'assistant', content: JSON.stringify(reply), createdAt: '2026-10-25T10:00:00Z' })

  it('the reply keeps its care focus and offers nearby hospitals', () => {
    expect(m.care).toEqual({ issue: 'Ankle sprain', specialty: 'orthopaedics' })
    const onNearby = vi.fn()
    render(<ToastProvider><AssistantMessage m={m} onFeedback={() => {}} onShare={() => {}} consultationId="c1" onNearby={onNearby} /></ToastProvider>)
    fireEvent.click(screen.getByRole('button', { name: 'Show nearby hospitals for this issue' }))
    expect(onNearby).toHaveBeenCalled()
  })

  it('no button once nearby care is shown, or for questions', () => {
    render(<ToastProvider><AssistantMessage m={m} onFeedback={() => {}} onShare={() => {}} consultationId="c1" onNearby={null} /></ToastProvider>)
    expect(screen.queryByRole('button', { name: 'Show nearby hospitals for this issue' })).toBeNull()
    cleanup()
    const q = toBubble({ id: 'm2', role: 'assistant', content: JSON.stringify({ followUpQuestions: ['Since when?'] }), createdAt: '2026-10-25T10:00:00Z' })
    render(<ToastProvider><AssistantMessage m={q} onFeedback={() => {}} onShare={() => {}} consultationId="c1" onNearby={() => {}} /></ToastProvider>)
    expect(screen.queryByRole('button', { name: 'Show nearby hospitals for this issue' })).toBeNull()
  })
})

describe('helpers', () => {
  beforeEach(resetPositionForTests)

  it('formats distances and builds Google Maps links', () => {
    expect([formatKm(0.004), formatKm(0.34), formatKm(1.42), formatKm(12.6)]).toEqual(['10 m', '340 m', '1.4 km', '13 km'])
    expect(mapsSearchUrl('ENT clinic', null)).toBe('https://www.google.com/maps/search/ENT%20clinic%20near%20me')
    expect(directionsUrl({ lat: 1, lng: 2 })).toBe('https://www.google.com/maps/dir/?api=1&destination=1,2')
  })

  it('asks for the position once, reuses it, and reports a refusal', async () => {
    const getCurrentPosition = vi.fn((ok) => ok({ coords: { latitude: 12.9, longitude: 77.6 } }))
    vi.stubGlobal('navigator', { geolocation: { getCurrentPosition } })
    expect(await getPosition()).toMatchObject({ lat: 12.9, lng: 77.6 })
    await getPosition()
    expect(getCurrentPosition).toHaveBeenCalledTimes(1)
    resetPositionForTests()
    getCurrentPosition.mockImplementation((_ok, fail) => fail({ code: 1 }))
    await expect(getPosition()).rejects.toMatchObject({ kind: 'denied' })
    vi.unstubAllGlobals()
  })
})
