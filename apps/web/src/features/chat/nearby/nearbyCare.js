// Nearby hospitals / clinics for the problem a chat is about. The backend picks
// the specialty from the assessment (or what the person wrote) and searches
// Amazon Location Service; the position is used for that search only.

import { request } from '../../../services/api/httpClient'

// Assessments at or above this risk score show nearby care automatically;
// below it the reply offers a button.
export const AUTO_NEARBY_RISK = 65

export const findNearbyCare = (body) => request('/care/nearby', { method: 'POST', body })

// One position per 10 minutes is plenty for "near me", and a fresh fix can
// take seconds on a laptop. The browser asks for permission in THIS tab, so
// the prompt is never hidden behind a new one.
const POSITION_MAX_AGE = 10 * 60 * 1000
let lastPosition = null

export class LocationError extends Error {
  constructor(kind) {
    super(kind)
    this.kind = kind // 'denied' | 'unavailable' | 'unsupported'
  }
}

export const getPosition = () => new Promise((resolve, reject) => {
  if (lastPosition && Date.now() - lastPosition.at < POSITION_MAX_AGE) { resolve(lastPosition); return }
  if (!navigator.geolocation) { reject(new LocationError('unsupported')); return }
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lastPosition = { lat: pos.coords.latitude, lng: pos.coords.longitude, at: Date.now() }
      resolve(lastPosition)
    },
    (err) => reject(new LocationError(err?.code === 1 ? 'denied' : 'unavailable')),
    { enableHighAccuracy: false, timeout: 12000, maximumAge: POSITION_MAX_AGE },
  )
})

export const resetPositionForTests = () => { lastPosition = null }

// Plain links: they open Google Maps at once (no blank tab waiting for a
// location), already pointed at the right place.
export const mapsSearchUrl = (term, pos) => (pos
  ? `https://www.google.com/maps/search/${encodeURIComponent(term)}/@${pos.lat},${pos.lng},14z`
  : `https://www.google.com/maps/search/${encodeURIComponent(`${term} near me`)}`)
export const directionsUrl = (place) => `https://www.google.com/maps/dir/?api=1&destination=${place.lat},${place.lng}`

export const formatKm = (km) => (km < 1 ? `${Math.max(10, Math.round(km * 100) * 10)} m` : `${km < 10 ? km.toFixed(1) : Math.round(km)} km`)

export const KIND_LABEL = { hospital: 'Hospital', clinic: 'Clinic', doctor: 'Doctor', dentist: 'Dental clinic' }

// The Google Maps search for a specialty before the server has answered (the
// same first search term the backend uses), e.g. when location is off.
const SEARCH_TERMS = {
  cardiology: 'cardiologist', neurology: 'neurologist', pulmonology: 'pulmonologist', orthopaedics: 'orthopaedic',
  gastroenterology: 'gastroenterologist', urology: 'urologist', gynaecology: 'gynaecologist', paediatrics: 'paediatrician',
  dermatology: 'dermatologist', ophthalmology: 'eye hospital', ent: 'ENT clinic', dentistry: 'dental clinic',
  psychiatry: 'psychiatrist', endocrinology: 'diabetologist',
}
export const searchTermFor = (specialty) => SEARCH_TERMS[specialty] || 'hospital'
