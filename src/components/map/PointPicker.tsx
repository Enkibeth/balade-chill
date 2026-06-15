'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import { Search, Loader2 } from 'lucide-react'
import { useIsLight } from '@/hooks/useTheme'

export interface PickedPoint {
  lat: number
  lng: number
  label?: string
}

function pinIcon(color: string) {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:9999px 9999px 9999px 2px;background:${color};border:2px solid #fff;color:#fff;font-size:12px;font-weight:700;font-family:ui-sans-serif,system-ui,sans-serif;box-shadow:0 2px 6px rgba(0,0,0,.5);">●</div>`,
    iconSize: [26, 26],
    iconAnchor: [13, 26],
  })
}

const PIN_ICON = pinIcon('#d4af37')

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
    if (center) map.setView(center, Math.max(map.getZoom(), 15))
  }, [center, map])
  return null
}

/**
 * Interactive picker to place a single point (one étape) on a map. The exact
 * coordinates are captured on click/drag and the precise place name is resolved
 * in the background (reverse-geocode), so the caller always gets coords + name.
 */
export function PointPicker({
  city,
  country,
  value,
  onChange,
}: {
  city: string
  country: string
  value: PickedPoint | null
  onChange: (v: PickedPoint) => void
}) {
  const light = useIsLight()
  const [query, setQuery] = useState('')
  const [searching, setSearching] = useState(false)
  const [searchError, setSearchError] = useState<string | null>(null)
  const [resolving, setResolving] = useState(false)
  const [center, setCenter] = useState<[number, number] | null>(
    value ? [value.lat, value.lng] : null,
  )
  const didCenter = useRef(false)
  // Monotonic id so a newer drop/drag supersedes a slower reverse-geocode.
  const dropId = useRef(0)

  // Centre on the étape's current point, or on the city, the first time.
  useEffect(() => {
    if (didCenter.current || value) return
    const c = city.trim()
    if (!c) return
    didCenter.current = true
    let cancelled = false
    fetch('/api/geocode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: c, city: c, country }),
    })
      .then((r) => r.json())
      .then((d) => {
        if (cancelled || d?.lat == null) return
        setCenter([d.lat, d.lng])
      })
      .catch(() => {})
    return () => {
      cancelled = true
    }
  }, [city, country, value])

  async function reverseLabel(
    lat: number,
    lng: number,
  ): Promise<string | undefined> {
    try {
      const res = await fetch('/api/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lat, lng }),
      })
      const d = await res.json().catch(() => null)
      if (res.ok && typeof d?.displayName === 'string') return d.displayName
    } catch {
      /* best-effort: keep the raw coordinates */
    }
    return undefined
  }

  // Drop a point and resolve its exact place name in the background.
  async function dropPoint(lat: number, lng: number) {
    onChange({ lat, lng, label: value?.label })
    const id = ++dropId.current
    setResolving(true)
    const label = await reverseLabel(lat, lng)
    if (id !== dropId.current) return // superseded by a newer drop
    setResolving(false)
    onChange({ lat, lng, label })
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
      dropId.current += 1 // cancel any in-flight reverse-geocode
      onChange({ lat: d.lat, lng: d.lng, label: d.displayName })
    } catch {
      setSearchError('Erreur réseau pendant la recherche.')
    } finally {
      setSearching(false)
    }
  }

  const FRANCE: [number, number] = [46.6, 2.3]
  const mapCenter: [number, number] =
    center ?? (value ? [value.lat, value.lng] : FRANCE)

  return (
    <div className="space-y-2">
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

      <div className="h-56 overflow-hidden rounded-2xl border border-amber-200/15">
        <MapContainer
          center={mapCenter}
          zoom={value ? 15 : 6}
          scrollWheelZoom={false}
          style={{
            height: '100%',
            width: '100%',
            background: light ? '#f4ead6' : '#1a0f08',
          }}
        >
          <TileLayer
            url={`https://{s}.basemaps.cartocdn.com/${
              light ? 'light_all' : 'dark_all'
            }/{z}/{x}/{y}{r}.png`}
            subdomains="abcd"
            attribution="© OpenStreetMap © CARTO"
          />
          <Recenter center={center} />
          <ClickCapture onPick={(lat, lng) => dropPoint(lat, lng)} />
          {value && (
            <Marker
              position={[value.lat, value.lng]}
              icon={PIN_ICON}
              draggable
              eventHandlers={{
                dragend: (e) => {
                  const ll = (e.target as L.Marker).getLatLng()
                  dropPoint(ll.lat, ll.lng)
                },
              }}
            />
          )}
        </MapContainer>
      </div>

      <div className="space-y-0.5 text-[11px] text-amber-100/45">
        {value && (
          <p>
            <span className="text-amber-300">●</span> Lieu choisi :{' '}
            {value.label ?? `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}`}
          </p>
        )}
        {resolving && (
          <p className="flex items-center gap-1.5 text-amber-100/30">
            <Loader2 size={11} className="animate-spin" /> Localisation du lieu…
          </p>
        )}
        {!value && (
          <p className="text-amber-100/35">
            Clique sur la carte ou cherche une adresse pour placer le lieu exact
            de cette étape.
          </p>
        )}
      </div>
    </div>
  )
}
