// A chat message with the hospitals / clinics nearest to the person that treat
// the problem the chat is about: the top 3 as a list (name, distance, type),
// a map, and links that open Google Maps straight away.

// eslint-disable-next-line no-unused-vars -- `motion` is used via motion.* JSX
import { motion } from 'framer-motion'
import { lazy, Suspense, useEffect, useRef } from 'react'
import { Ambulance, Map as MapIcon, MapPin, Navigation, Phone, RotateCw } from 'lucide-react'
import { Button, messageEnter, useReducedMotion } from '../../../components/ui'
import { fmtTime } from '../utils/format.jsx'
import { KIND_LABEL, directionsUrl, formatKm, mapsSearchUrl, searchTermFor } from './nearbyCare'

const NearbyMap = lazy(() => import('./NearbyMap.jsx'))

const NEW_TAB = { target: '_blank', rel: 'noopener noreferrer' }
// "Bones & joints (Orthopaedics)" -> "Orthopaedics" (no regex: plain index lookups).
const shortSpecialty = (label = '') => {
  const open = label.lastIndexOf('(')
  const close = label.lastIndexOf(')')
  return open >= 0 && close > open + 1 ? label.slice(open + 1, close) : label
}

const ERRORS = {
  denied: 'Location access is off, so I can’t see which places are near you. Allow location for this site and try again, or search on Google Maps.',
  unavailable: 'I couldn’t get your location just now. Try again, or search on Google Maps.',
  unsupported: 'This browser can’t share your location. You can search on Google Maps instead.',
  service: 'I couldn’t look up nearby places right now. Try again, or search on Google Maps.',
}

function Intro({ data }) {
  const spec = data.specialty === 'general' ? null : shortSpecialty(data.specialtyLabel)
  if (!data.issue) return <p>Hospitals and clinics closest to you:</p>
  return (
    <p>
      For <strong>{data.issue}</strong>{spec ? <> — the nearest places for <strong>{spec}</strong> care first:</> : <>, the closest places to get care:</>}
    </p>
  )
}

export function NearbyCareMessage({ entry, onRetry }) {
  const ref = useRef(null)
  const reduced = useReducedMotion()
  const { status, data, error, position, anchor } = entry
  const term = data?.searchTerm || searchTermFor(anchor?.care?.specialty)

  // When the results arrive, scroll the conversation (only its own scroll
  // area, never the page) so the message's top is in view.
  useEffect(() => {
    const el = ref.current
    const box = el?.closest('.chat-scroll')
    if (status !== 'ready' || !box) return
    const top = el.getBoundingClientRect().top - box.getBoundingClientRect().top + box.scrollTop - 16
    box.scrollTo({ top, behavior: reduced ? 'auto' : 'smooth' })
  }, [status, reduced])

  const busy = status === 'locating' || status === 'searching'
  const spec = data && data.specialty !== 'general' ? shortSpecialty(data.specialtyLabel) : null
  return (
    <motion.article ref={ref} className="msg-ai nb" aria-label="Nearby hospitals and clinics" aria-busy={busy} {...messageEnter}>
      <header className="msg-ai-head">
        <span className="msg-ai-who">
          <span className="msg-ai-mark"><MapPin size={16} aria-hidden="true" /></span>
          <span className="msg-ai-name">Nearby care</span>
          <time className="msg-ai-time" dateTime={entry.at}>{fmtTime(entry.at)}</time>
        </span>
      </header>

      {busy && (
        <output className="msg-thinking nb-wait">
          <span>{status === 'locating' ? 'Finding your location' : 'Finding hospitals and clinics near you'}</span>
          <span className="msg-dots" aria-hidden="true"><span /><span /><span /></span>
        </output>
      )}

      {status === 'error' && (
        <div className="msg-ai-body nb-error">
          <p>{ERRORS[error] || ERRORS.service}</p>
          <div className="nb-actions">
            {error !== 'unsupported' && <Button size="sm" variant="secondary" icon={RotateCw} onClick={onRetry}>Try again</Button>}
            <Button size="sm" variant="ghost" icon={MapIcon} href={mapsSearchUrl(term, null)} {...NEW_TAB}>Search on Google Maps</Button>
          </div>
        </div>
      )}

      {status === 'ready' && data && (
        <>
          <div className="msg-ai-body rt"><Intro data={data} /></div>
          {data.severity === 'EMERGENCY' && (
            <p className="nb-sos"><Ambulance size={16} aria-hidden="true" /><span>In an emergency, <a href="tel:108"><strong>call 108</strong></a> first. The ambulance knows the nearest emergency room.</span></p>
          )}
          {data.places.length ? (
            <ul className="nb-list" aria-label="Nearest places">
              {data.places.map((p, i) => (
                <li key={p.id || p.name} className="nb-item">
                  <span className="nb-num" aria-hidden="true">{i + 1}</span>
                  <div className="nb-info">
                    <p className="nb-name">{p.name}</p>
                    <p className="nb-meta">
                      <strong>{formatKm(p.distanceKm)}</strong> away · {KIND_LABEL[p.kind] || 'Clinic'}
                      {p.matchesSpecialty && spec && <span className="nb-tag">{spec}</span>}
                      {p.emergency && <span className="nb-tag nb-tag--er">Emergency room</span>}
                    </p>
                    {p.address && <p className="nb-addr">{p.address}</p>}
                  </div>
                  <span className="nb-item-actions">
                    <Button size="sm" variant="ghost" icon={Navigation} href={directionsUrl(p)} {...NEW_TAB} aria-label={`Directions to ${p.name}`}>Directions</Button>
                    {p.phone && <Button size="sm" variant="ghost" icon={Phone} href={`tel:${p.phone.replace(/[^\d+]/g, '')}`} aria-label={`Call ${p.name}`}>Call</Button>}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="msg-ai-body">I couldn’t find a hospital or clinic within {data.radiusKm} km. Try Google Maps below.</p>
          )}
          {data.places.length > 0 && position && (
            <Suspense fallback={<div className="nb-map nb-map--loading" aria-hidden="true" />}>
              <NearbyMap origin={position} places={data.places} />
            </Suspense>
          )}
          <footer className="nb-foot">
            <Button size="sm" variant="secondary" icon={MapIcon} href={mapsSearchUrl(term, position)} {...NEW_TAB}>Open in Google Maps</Button>
          </footer>
          <output className="sr-only">{`Found ${data.places.length} places near you.`}</output>
        </>
      )}
    </motion.article>
  )
}
