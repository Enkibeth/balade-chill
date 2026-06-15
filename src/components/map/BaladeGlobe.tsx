'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import {
  MapContainer,
  TileLayer,
  Marker,
  Popup,
  Polyline,
  useMap,
  useMapEvents,
} from 'react-leaflet'
import L from 'leaflet'
import type { Balade } from '@/types'
import { useIsLight } from '@/hooks/useTheme'

export interface GlobeBalade {
  balade: Balade
  score: number
  date: string
  progress?: {
    enigmesDone: number
    enigmesTotal: number
    medicineDone: number
    medicineTotal: number
    missionsDone: number
    missionsTotal: number
  }
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

/** Fits all balades into view once, and fixes iOS 0-height mounts. */
function MapSetup({
  points,
}: {
  points: { lat: number; lng: number }[]
}) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize()
      if (points.length === 1) {
        map.setView([points[0].lat, points[0].lng], 13)
      } else if (points.length > 1) {
        map.fitBounds(
          L.latLngBounds(points.map((p) => [p.lat, p.lng])),
          { padding: [48, 48] },
        )
      }
    }, 200)
    return () => clearTimeout(t)
    // Run once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** Flies to a balade when the selection changes (not on first render). */
function FlyToSelected({
  selectedId,
  lat,
  lng,
}: {
  selectedId: string | null
  lat?: number
  lng?: number
}) {
  const map = useMap()
  const prev = useRef<string | null>(selectedId)
  useEffect(() => {
    if (
      selectedId &&
      selectedId !== prev.current &&
      lat != null &&
      lng != null
    ) {
      map.flyTo([lat, lng], 14, { duration: 1.2 })
    }
    prev.current = selectedId
  }, [selectedId, lat, lng, map])
  return null
}

function FlyToUser({ position }: { position: [number, number] | null }) {
  const map = useMap()
  useMapEvents({})
  useEffect(() => {
    if (position) map.flyTo(position, 15, { duration: 1.2 })
  }, [position, map])
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
  const light = useIsLight()
  const [userPosition, setUserPosition] = useState<[number, number] | null>(null)
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

  // Raster tiles loaded as <img> — no WebGL, works everywhere (incl. iOS).
  // Use Mapbox raster when a token is set (proven to load on the device),
  // otherwise the free, no-auth CARTO dark basemap.
  const tile = mapboxToken
    ? {
        url: `https://api.mapbox.com/styles/v1/mapbox/${
          light ? 'light-v11' : 'dark-v11'
        }/tiles/512/{z}/{x}/{y}@2x?access_token=${mapboxToken}`,
        tileSize: 512,
        zoomOffset: -1,
        attribution: '© Mapbox © OpenStreetMap',
        subdomains: 'abc',
      }
    : {
        url: `https://{s}.basemaps.cartocdn.com/${
          light ? 'light_all' : 'dark_all'
        }/{z}/{x}/{y}{r}.png`,
        tileSize: 256,
        zoomOffset: 0,
        attribution: '© OpenStreetMap © CARTO',
        subdomains: 'abcd',
      }

  const center: [number, number] = points[0]
    ? [points[0].lat, points[0].lng]
    : [48.8566, 2.3522]

  return (
    <div className="relative h-full min-h-[320px] overflow-hidden rounded-2xl border border-amber-200/15 bg-[#1a0f08]">
      <button
        type="button"
        onClick={() => {
          if (!navigator.geolocation) return
          navigator.geolocation.getCurrentPosition((pos) => {
            setUserPosition([pos.coords.latitude, pos.coords.longitude])
          })
        }}
        className="absolute right-3 top-3 z-[1000] rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-medium text-amber-950 shadow"
      >
        Me localiser
      </button>
      <MapContainer
        center={center}
        zoom={points[0] ? 12 : 4}
        scrollWheelZoom
        style={{
          height: '100%',
          width: '100%',
          background: light ? '#f4ead6' : '#1a0f08',
        }}
      >
        <TileLayer
          url={tile.url}
          tileSize={tile.tileSize}
          zoomOffset={tile.zoomOffset}
          attribution={tile.attribution}
          subdomains={tile.subdomains}
        />

        <MapSetup points={points} />
        <FlyToSelected
          selectedId={selectedId}
          lat={selected?.lat}
          lng={selected?.lng}
        />
        <FlyToUser position={userPosition} />

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

        {points.map((p) => {
          const radius = 6 + (p.score / maxScore) * 14
          const isSel = p.balade.id === selectedId
          return (
            <Marker
              key={p.balade.id}
              position={[p.lat, p.lng]}
              icon={circleIcon(
                p.balade.theme_color.primary,
                isSel ? '#fff' : p.balade.theme_color.secondary,
                radius * 2,
                isSel,
              )}
              eventHandlers={{ click: () => onSelect(p.balade.id) }}
            >
              <Popup>
                <strong>{p.balade.title}</strong>
                <br />
                {p.balade.city} · {new Date(p.date).toLocaleDateString('fr-FR')}
                <br />
                Difficulté: {p.balade.difficulty}
                <br />
                Énigmes {p.progress?.enigmesDone ?? 0}/{p.progress?.enigmesTotal ?? 0} ·
                Médecine {p.progress?.medicineDone ?? 0}/{p.progress?.medicineTotal ?? 0} ·
                Missions {p.progress?.missionsDone ?? 0}/{p.progress?.missionsTotal ?? 0}
                <br />
                <a href={`/balade/${p.balade.id}`}>Ouvrir la balade</a>
                {' · '}
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lng}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  {"S'y rendre"}
                </a>
              </Popup>
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
                  <br />
                  <a
                    href={`https://www.google.com/maps/dir/?api=1&destination=${e.lat},${e.lng}`}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {"Lancer l'itinéraire"}
                  </a>
                </Popup>
              </Marker>
            ))}
        {userPosition && (
          <Marker
            position={userPosition}
            icon={circleIcon('#3b82f6', '#93c5fd', 18, true)}
          >
            <Popup>Votre position</Popup>
          </Marker>
        )}
      </MapContainer>
    </div>
  )
}
