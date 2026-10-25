// The map inside a nearby-care message: you + the numbered places. Leaflet and
// its CSS load on first use (their own chunk), so the chat never waits for them.
// Tiles: OpenStreetMap (attribution shown on the map).

import { useEffect, useRef, useState } from 'react'

let leaflet = null
const loadLeaflet = () => {
  leaflet ??= Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([L]) => L)
  return leaflet
}

const pin = (L, cls, text, size) => L.divIcon({
  className: cls, html: `<span>${text}</span>`, iconSize: [size, size], iconAnchor: [size / 2, size / 2],
})

export default function NearbyMap({ origin, places }) {
  const el = useRef(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let map = null
    let cancelled = false
    loadLeaflet().then((L) => {
      if (cancelled || !el.current) return
      map = L.map(el.current, { scrollWheelZoom: false, zoomSnap: 0.5 })
      map.attributionControl.setPrefix(false)
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
        maxZoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener noreferrer">OpenStreetMap</a>',
      }).addTo(map)
      L.marker([origin.lat, origin.lng], { icon: pin(L, 'nb-pin-you', '', 18), title: 'You are here', keyboard: false }).addTo(map)
      places.forEach((p, i) => {
        const tip = document.createElement('span')
        tip.textContent = p.name // text, never HTML: names come from a third-party data set
        L.marker([p.lat, p.lng], { icon: pin(L, 'nb-pin', String(i + 1), 28), title: p.name, alt: `${i + 1}. ${p.name}` })
          .bindTooltip(tip, { direction: 'top', offset: [0, -14] })
          .addTo(map)
      })
      const bounds = L.latLngBounds([[origin.lat, origin.lng], ...places.map((p) => [p.lat, p.lng])])
      map.fitBounds(bounds, { padding: [32, 32], maxZoom: 15 })
    }).catch(() => { if (!cancelled) setFailed(true) })
    return () => { cancelled = true; map?.remove() }
  }, [origin, places])

  if (failed) return null // the list and the Google Maps link still work
  return (
    <div className="nb-map" ref={el} role="region"
      aria-label={`Map of your location and ${places.length} nearby place${places.length === 1 ? '' : 's'}`} />
  )
}
