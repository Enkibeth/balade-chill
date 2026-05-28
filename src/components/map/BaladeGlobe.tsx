'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
} from 'react-leaflet'
import L from 'leaflet'
import { LocateFixed } from 'lucide-react'
import type { Balade } from '@/types'

export interface BaladeProgress {
  enigmes: { done: number; total: number }
  medical: { done: number; total: number }
  missions: { done: number; total: number }
}

export interface GlobeBalade {
  balade: Balade
  score: number
  date: string
  progress?: BaladeProgress
}

function centroid(balade: Balade): { lat: number; lng: number } | null {
  const pts = balade.etapes.filter(
    (e) => Number.isFinite(e.lat) && Number.isFinite(e.lng),
  )
  if (pts.length === 0) return null
  return {
    lat: pts.reduce((s, e) => s + e.lat, 0) / pts.length,
    lng: pts.reduce((s, e) => s + e.lng, 0) / pts.length,
  }
}

function circleIcon(color: string, border: string, size: number, glow: boolean) {
  return L.divIcon({
    className: '',
    html: `<div style="width:${size}px;height:${size}px;border-radius:9999px;background:${color};border:2px solid ${border};${
      glow ? `box-shadow:0 0 14px ${border};` : ''
    }"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  })
}

function numberIcon(color: string, label: number) {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:24px;height:24px;border-radius:9999px;background:${color};border:1.5px solid #fff;color:#fff;font-size:11px;font-weight:700;font-family:ui-sans-serif,system-ui,sans-serif;">${label}</div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  })
}

const USER_ICON = L.divIcon({
  className: '',
  html: `<div style="width:18px;height:18px;border-radius:9999px;background:#3b82f6;border:3px solid #fff;box-shadow:0 0 0 4px rgba(59,130,246,0.3);"></div>`,
  iconSize: [18, 18],
  iconAnchor: [9, 9],
})

/** Fits all balades into view once, and fixes iOS 0-height mounts. */
function MapSetup({ points }: { points: { lat: number; lng: number }[] }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize()
      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 13)
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points.map((p) => [p.lat, p.lng])), {
          padding: [48, 48],
        })
      }
    }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** Flies the map to a point when it changes (skips the first render). */
function FlyTo({ id, lat, lng }: { id: string | null; lat?: number; lng?: number }) {
  const map = useMap()
  const prev = useRef<string | null>(id)
  useEffect(() => {
    if (id && id !== prev.current && lat != null && lng != null) {
      map.flyTo([lat, lng], 14, { duration: 1.2 })
    }
    prev.current = id
  }, [id, lat, lng, map])
  return null
}

export function BaladeGlobe({
  items,
  selectedId,
  onSelect,
  mapboxToken,
}: {
  items: GlobeBalade[]
  selectedId: string | null
  onSelect: (id: string) => void
  mapboxToken: string | null
}) {
  const [userPos, setUserPos] = useState<[number, number] | null>(null)
  const [locating, setLocating] = useState(false)
  const [locError, setLocError] = useState<string | null>(null)

  const points = useMemo(
    () =>
      items
        .map((it) => {
          const c = centroid(it.balade)
          return c ? { ...it, ...c } : null
        })
        .filter((p): p is GlobeBalade & { lat: number; lng: number } =>
          Boolean(p),
        ),
    [items],
  )

  const maxScore = Math.max(1, ...points.map((p) => p.score))
  const selected = points.find((p) => p.balade.id === selectedId) ?? null

  const routeCoords = useMemo<[number, number][]>(() => {
    if (!selected) return []
    return [...selected.balade.etapes]
      .sort((a, b) => a.order - b.order)
      .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng))
      .map((e) => [e.lat, e.lng])
  }, [selected])

  const tile = mapboxToken
    ? {
        url: `https://api.mapbox.com/styles/v1/mapbox/dark-v11/tiles/512/{z}/{x}/{y}@2x?access_token=${mapboxToken}`,
        tileSize: 512,
        zoomOffset: -1,
        attribution: '© Mapbox © OpenStreetMap',
        subdomains: 'abc',
      }
    : {
        url: 'https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',
        tileSize: 256,
        zoomOffset: 0,
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
      }

  const center: [number, number] = points[0]
    ? [points[0].lat, points[0].lng]
    : [48.8566, 2.3522]

  function handleLocate() {
    if (!('geolocation' in navigator)) {
      setLocError('Géolocalisation non disponible.')
      return
    }
    setLocError(null)
    setLocating(true)
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserPos([pos.coords.latitude, pos.coords.longitude])
        setLocating(false)
      },
      () => {
        setLocating(false)
        setLocError('Position refusée ou indisponible.')
      },
      { enableHighAccuracy: true, timeout: 10000 },
    )
  }

  return (
    <div className="relative h-full min-h-[320px] overflow-hidden rounded-2xl border border-amber-200/15 bg-[#1a0f08]">
      <MapContainer
        center={center}
        zoom={points[0] ? 12 : 4}
        scrollWheelZoom
        style={{ height: '100%', width: '100%', background: '#1a0f08' }}
      >
        <TileLayer
          url={tile.url}
          tileSize={tile.tileSize}
          zoomOffset={tile.zoomOffset}
          attribution={tile.attribution}
          subdomains={tile.subdomains}
        />

        <MapSetup points={points} />
        <FlyTo id={selectedId} lat={selected?.lat} lng={selected?.lng} />
        {userPos && (
          <FlyTo id="__user__" lat={userPos[0]} lng={userPos[1]} />
        )}

        {routeCoords.length >= 2 && (
          <Polyline
            positions={routeCoords}
            pathOptions={{
              color: selected?.balade.theme_color.secondary ?? '#b8860b',
              weight: 3,
              opacity: 0.85,
            }}
          />
        )}

        {/* Balade centroid markers — hidden for the selected balade
            (its numbered étape markers are shown instead). */}
        {points
          .filter((p) => p.balade.id !== selectedId)
          .map((p) => {
            const radius = 6 + (p.score / maxScore) * 14
            return (
              <Marker
                key={p.balade.id}
                position={[p.lat, p.lng]}
                icon={circleIcon(
                  p.balade.theme_color.primary,
                  p.balade.theme_color.secondary,
                  radius * 2,
                  false,
                )}
                eventHandlers={{ click: () => onSelect(p.balade.id) }}
              >
                <BaladePopup item={p} />
              </Marker>
            )
          })}

        {selected &&
          [...selected.balade.etapes]
            .sort((a, b) => a.order - b.order)
            .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng))
            .map((e) => (
              <Marker
                key={e.id}
                position={[e.lat, e.lng]}
                icon={numberIcon(
                  selected.balade.theme_color.secondary,
                  e.order,
                )}
              >
                <Popup>
                  <strong>
                    {e.order}. {e.location_name}
                  </strong>
                </Popup>
              </Marker>
            ))}

        {userPos && <Marker position={userPos} icon={USER_ICON} />}
      </MapContainer>

      <button
        onClick={handleLocate}
        className="absolute right-3 top-3 z-[1000] inline-flex items-center gap-1.5 rounded-lg border border-amber-200/30 bg-black/70 px-3 py-1.5 text-xs text-amber-100 backdrop-blur transition hover:bg-black/85"
      >
        <LocateFixed size={14} />
        {locating ? 'Localisation…' : 'Me localiser'}
      </button>

      {locError && (
        <div className="absolute inset-x-3 bottom-9 z-[1000] rounded-lg bg-rose-900/80 px-3 py-1.5 text-center text-[11px] text-rose-50 backdrop-blur">
          {locError}
        </div>
      )}
    </div>
  )
}

function BaladePopup({ item }: { item: GlobeBalade }) {
  const b = item.balade
  const p = item.progress
  return (
    <Popup>
      <div style={{ minWidth: 190 }}>
        <strong style={{ fontSize: 14, color: '#1c1917' }}>{b.title}</strong>
        <div style={{ fontSize: 11, color: '#78716c', marginTop: 2 }}>
          {b.city} · {new Date(item.date).toLocaleDateString('fr-FR')} ·{' '}
          {b.difficulty}
        </div>
        {p && (
          <div
            style={{
              marginTop: 8,
              display: 'grid',
              gap: 3,
              fontSize: 12,
              color: '#44403c',
            }}
          >
            <ProgressRow label="Énigmes" v={p.enigmes} />
            <ProgressRow label="Médecine" v={p.medical} />
            <ProgressRow label="Missions" v={p.missions} />
          </div>
        )}
        <Link
          href={`/balade/${b.id}`}
          style={{
            display: 'block',
            marginTop: 10,
            textAlign: 'center',
            background: b.theme_color.primary,
            color: '#fff',
            borderRadius: 8,
            padding: '6px 10px',
            fontSize: 12,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          Ouvrir la balade
        </Link>
      </div>
    </Popup>
  )
}

function ProgressRow({
  label,
  v,
}: {
  label: string
  v: { done: number; total: number }
}) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between' }}>
      <span>{label}</span>
      <span style={{ fontWeight: 600 }}>
        {v.done}/{v.total}
      </span>
    </div>
  )
}
