'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import { useMemo, useRef, useState } from 'react'
import Map, {
  Marker,
  Popup,
  Source,
  Layer,
  type MapRef,
} from 'react-map-gl/mapbox'
import type { Balade } from '@/types'

const MAPBOX_TOKEN = process.env.NEXT_PUBLIC_MAPBOX_TOKEN

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

export function BaladeGlobe({
  items,
  selectedId,
  onSelect,
}: {
  items: GlobeBalade[]
  selectedId: string | null
  onSelect: (id: string) => void
}) {
  const mapRef = useRef<MapRef>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

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
          Carte indisponible — ajoute{' '}
          <code className="text-amber-300">NEXT_PUBLIC_MAPBOX_TOKEN</code> dans
          ton environnement pour afficher le globe.
        </p>
      </div>
    )
  }

  const initial = points[0]

  return (
    <div className="h-full min-h-[320px] overflow-hidden rounded-2xl border border-amber-200/15">
      <Map
        ref={mapRef}
        mapboxAccessToken={MAPBOX_TOKEN}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        projection={{ name: 'globe' }}
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
