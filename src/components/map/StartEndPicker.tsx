'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { Search, Loader2, RotateCcw } from 'lucide-react'

export interface PickPoint {
  lat: number
  lng: number
  label?: string
}

export interface StartEndValue {
  start: PickPoint | null
  end: PickPoint | null
  loop: boolean
}

// Centre of France — fallback view before the city is geocoded.
const FRANCE: [number, number] = [46.6, 2.3]

function pinIcon(color: string, label: string) {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px 9999px 9999px 2px;background:${color};border:2px solid #fff;color:#fff;font-size:12px;font-weight:700;font-family:ui-sans-serif,system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.5);">${label}</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  })
}

const START_ICON = pinIcon('#10b981', 'D')
const END_ICON = pinIcon('#f43f5e', 'A')

function ClickCapture({
  onPick,
}: {
  onPick: (lat: number, lng: number) => void
}) {
  useMapEvents({
    click(e) {
      onPick(e.latlng.lat, e.latlng.lng)
    },
  })
  return null
}

function Recenter({ center }: { center: [number, number] | null }) {
  const map = useMap()
  useEffect(() => {
    map.invalidateSize()
    if (center) map.setView(center, Math.max(map.getZoom(), 14))
  }, [center, map])
  return null
}

/**
 * Interactive picker to place a balade's start (and optional end) point on a
 * map. Recommended but optional — it removes any ambiguity about where the
 * walk begins and ends so the AI can't drift.
 */
export function StartEndPicker({
  city,
  country,
  value,
  onChange,
}: {
  city: string
  country: string
  value: StartEndValue
  onChange: (v: StartEndValue) => void
}) {
  const [active, setActive] = useState<'start' | 'end'>('start')
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [center, setCenter] = useState<[number, number] | null>(
    value.start ? [value.start.lat, value.start.lng] : null,
  )
  const didCenterCity = useRef(false)

  // Centre the map on the balade's city the first time it's known, so the user
  // starts near the right place instead of the whole-country view.
  useEffect(() => {
    if (didCenterCity.current || value.start) return
    const c = city.trim()
    if (!c) return
    let cancelled = false
    fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: c, city: c, country }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || d?.lat == null) return
        didCenterCity.current = true
        setCenter([d.lat, d.lng])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [city, country, value.start])

  function setPoint(lat: number, lng: number, label?: string) {
    const point: PickPoint = { lat, lng, label }
    if (value.loop || active === 'start') {
      onChange({ ...value, start: point })
    } else {
      onChange({ ...value, end: point })
    }
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!query.trim()) return
    setSearching(true)
    setSearchError(null)
    try {
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: query.trim(), city, country }),
      })
      const d = await res.json().catch(() => null)
      if (!res.ok || d?.lat == null) {
        setSearchError(d?.error ?? 'Lieu introuvable.')
        return
      }
      setCenter([d.lat, d.lng])
      setPoint(d.lat, d.lng, d.displayName)
    } catch {
      setSearchError('Erreur réseau pendant la recherche.')
    } finally {
      setSearching(false)
    }
  }

  function toggleLoop() {
    if (value.loop) {
      onChange({ ...value, loop: false })
    } else {
      // Going back to a loop: the end mirrors the start, so drop the end point.
      onChange({ ...value, loop: true, end: null })
      setActive('start')
    }
  }

  function reset() {
    onChange({ start: null, end: null, loop: value.loop })
    setActive('start')
  }

  const mapCenter: [number, number] =
    center ?? (value.start ? [value.start.lat, value.start.lng] : FRANCE)
  const showEnd = !value.loop
  const line: [number, number][] =
    value.start && value.end && showEnd
      ? [
          [value.start.lat, value.start.lng],
          [value.end.lat, value.end.lng],
        ]
      : []

  return (
    <div className="space-y-2">
      {/* Address search */}
      <form onSubmit={handleSearch} className="flex gap-2">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Chercher une adresse ou un lieu…"
          className="w-full rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200/20 px-3 py-2 text-sm text-amber-100/80 transition hover:border-amber-200/40 disabled:opacity-40"
        >
          {searching ? (
            <Loader2 size={15} className="animate-spin" />
          ) : (
            <Search size={15} />
          )}
        </button>
      </form>
      {searchError && (
        <p className="text-[11px] text-rose-300/80">{searchError}</p>
      )}

      {/* Which point a click/search places (hidden in loop mode) */}
      {showEnd && (
        <div className="flex gap-2">
          {(['start', 'end'] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => setActive(k)}
              className={`flex-1 rounded-lg border px-3 py-1.5 text-xs transition ${
                active === k
                  ? 'border-amber-300/60 bg-amber-300/10 text-amber-100'
                  : 'border-amber-200/15 text-amber-100/55 hover:border-amber-200/35'
              }`}
            >
              <span
                className="mr-1.5 inline-block h-2.5 w-2.5 rounded-full align-middle"
                style={{ backgroundColor: k === 'start' ? '#10b981' : '#f43f5e' }}
              />
              {k === 'start' ? 'Départ' : 'Arrivée'}
            </button>
          ))}
        </div>
      )}

      <div className="h-64 overflow-hidden rounded-2xl border border-amber-200/15">
        <MapContainer
          center={mapCenter}
          zoom={value.start ? 14 : 6}
          scrollWheelZoom={false}
          style={{ height: '100%', width: '100%', background: '#1a0f08' }}
        >
          <TileLayer
            url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            subdomains="abcd"
            attribution="© OpenStreetMap © CARTO"
          />
          <Recenter center={center} />
          <ClickCapture onPick={(lat, lng) => setPoint(lat, lng)} />
          {line.length === 2 && (
            <Polyline
              positions={line}
              pathOptions={{ color: '#d4af37', weight: 2, dashArray: '6 6' }}
            />
          )}
          {value.start && (
            <Marker
              position={[value.start.lat, value.start.lng]}
              icon={START_ICON}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng()
                  onChange({
                    ...value,
                    start: { lat: ll.lat, lng: ll.lng },
                  })
                },
              }}
            />
          )}
          {showEnd && value.end && (
            <Marker
              position={[value.end.lat, value.end.lng]}
              icon={END_ICON}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng()
                  onChange({ ...value, end: { lat: ll.lat, lng: ll.lng } })
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="flex items-center justify-between gap-2">
        <label className="flex items-center gap-2 text-xs text-amber-100/60">
          <input
            type="checkbox"
            checked={value.loop}
            onChange={toggleLoop}
            className="accent-amber-300"
          />
          Boucle (arrivée = départ)
        </label>
        {(value.start || value.end) && (
          <button
            type="button"
            onClick={reset}
            className="inline-flex items-center gap-1.5 text-xs text-amber-100/50 transition hover:text-amber-100/80"
          >
            <RotateCcw size={12} /> Effacer
          </button>
        )}
      </div>

      <p className="text-[11px] text-amber-100/35">
        {value.start
          ? value.loop
            ? 'Départ et arrivée fixés sur ce point (boucle). Glisse le marqueur pour ajuster.'
            : `Départ${value.end ? ' et arrivée placés' : ' placé'} sur la carte. Glisse les marqueurs pour ajuster.`
          : 'Clique sur la carte ou cherche une adresse pour placer le point de départ. Recommandé pour éviter toute erreur de l’IA.'}
      </p>
    </div>
  )
}
