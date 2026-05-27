'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import Map, {
  Marker,
  Popup,
  Source,
  Layer,
  type MapRef,
} from 'react-map-gl/mapbox'
import type { Balade } from '@/types'

export interface GlobeBalade {
  balade: Balade
  score: number
  date: string
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


function staticOverviewUrl(
  points: Array<{ lat: number; lng: number }>,
  token: string,
): string {
  const pins = points
    .slice(0, 40)
    .map((p) => `pin-s+b8860b(${p.lng},${p.lat})`)
    .join(',')
  const overlay = pins.length ? `${pins}/` : ''
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${overlay}auto/1200x800?padding=64&access_token=${token}`
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
  const MAPBOX_TOKEN = mapboxToken
  const mapRef = useRef<MapRef>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [projectionName, setProjectionName] = useState<'globe' | 'mercator'>('mercator')
  const [mapFailed, setMapFailed] = useState(false)

  useEffect(() => {
    const ua = navigator.userAgent
    const isIOS = /iPhone|iPad|iPod/i.test(ua)
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setProjectionName(isIOS || prefersReducedMotion ? 'mercator' : 'globe')
  }, [])

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
  const staticMapUrl = useMemo(() => staticOverviewUrl(points, MAPBOX_TOKEN ?? ''), [points, MAPBOX_TOKEN])

  const routeLine = useMemo(() => {
    if (!selected) return null
    const coords = [...selected.balade.etapes]
      .sort((a, b) => a.order - b.order)
      .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng))
      .map((e) => [e.lng, e.lat])
    if (coords.length < 2) return null
    return {
      type: 'Feature' as const,
      geometry: { type: 'LineString' as const, coordinates: coords },
      properties: {},
    }
  }, [selected])

  function flyTo(lng: number, lat: number, zoom: number) {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1400 })
  }

  if (!MAPBOX_TOKEN) {
    return (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-amber-200/15 bg-black/40 p-6 text-center">
        <p className="text-sm text-amber-100/50">
          Carte indisponible — ajoute ton token Mapbox dans{' '}
          <a href="/settings" className="text-amber-300 underline">
            Réglages
          </a>{' '}
          pour afficher le globe.
        </p>
      </div>
    )
  }

  const initial = points[0]

  if (mapFailed) {
    return (
      <div className="relative h-full min-h-[320px] overflow-hidden rounded-2xl border border-amber-200/15 bg-black/40">
        <Image
          src={staticMapUrl}
          alt="Aperçu statique de la carte"
          fill
          sizes="100vw"
          className="object-cover"
          unoptimized
        />
        <div className="absolute inset-x-3 top-3 rounded-lg border border-amber-200/20 bg-black/65 p-3 text-xs text-amber-100/90">
          Mode compatibilité activé: la carte interactive a échoué sur cet appareil, affichage statique utilisé.
        </div>
      </div>
    )
  }

  return (
    <div className="h-full min-h-[320px] overflow-hidden rounded-2xl border border-amber-200/15">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        projection={{ name: projectionName }}
        fog={{
          color: '#1a0f08',
          'high-color': '#2a1a0e',
          'horizon-blend': 0.15,
          'space-color': '#0a0604',
          'star-intensity': 0.5,
        }}
        initialViewState={{
          longitude: initial?.lng ?? 2.3522,
          latitude: initial?.lat ?? 48.8566,
          zoom: initial ? 9 : 2.4,
        }}
        style={{ width: '100%', height: '100%' }}
        onError={(evt) => {
          console.error('Mapbox render error:', evt.error)
          setMapFailed(true)
        }}
      >
        {routeLine && (
          <Source id="route" type="geojson" data={routeLine}>
            <Layer
              id="route-line"
              type="line"
              paint={{
                'line-color': selected?.balade.theme_color.secondary ?? '#b8860b',
                'line-width': 3,
                'line-opacity': 0.8,
              }}
            />
          </Source>
        )}

        {points.map((p) => {
          const radius = 6 + (p.score / maxScore) * 14
          const isSel = p.balade.id === selectedId
          return (
            <Marker
              key={p.balade.id}
              longitude={p.lng}
              latitude={p.lat}
              anchor="center"
              onClick={() => {
                onSelect(p.balade.id)
                flyTo(p.lng, p.lat, 13)
              }}
            >
              <div
                onMouseEnter={() => setHoveredId(p.balade.id)}
                onMouseLeave={() => setHoveredId(null)}
                className="cursor-pointer rounded-full transition-transform hover:scale-125"
                style={{
                  width: radius * 2,
                  height: radius * 2,
                  backgroundColor: p.balade.theme_color.primary,
                  border: `2px solid ${
                    isSel ? '#fff' : p.balade.theme_color.secondary
                  }`,
                  boxShadow: isSel
                    ? `0 0 16px ${p.balade.theme_color.secondary}`
                    : 'none',
                }}
              />
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
                longitude={e.lng}
                latitude={e.lat}
                anchor="center"
              >
                <div
                  className="flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-bold text-white"
                  style={{
                    backgroundColor: selected.balade.theme_color.secondary,
                    border: '1.5px solid #fff',
                  }}
                >
                  {e.order}
                </div>
              </Marker>
            ))}

        {hoveredId &&
          (() => {
            const p = points.find((x) => x.balade.id === hoveredId)
            if (!p) return null
            return (
              <Popup
                longitude={p.lng}
                latitude={p.lat}
                anchor="bottom"
                offset={16}
                closeButton={false}
                closeOnClick={false}
              >
                <div className="text-xs">
                  <strong>{p.balade.title}</strong>
                  <br />
                  {new Date(p.date).toLocaleDateString('fr-FR')} · {p.score} pts
                </div>
              </Popup>
            )
          })()}
      </Map>
    </div>
  )
}
