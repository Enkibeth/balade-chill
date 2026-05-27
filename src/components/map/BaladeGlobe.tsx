'use client'

import 'maplibre-gl/dist/maplibre-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  Marker,
  Popup,
  Source,
  Layer,
  type MapRef,
} from 'react-map-gl/maplibre'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import type { Balade } from '@/types'

export interface GlobeBalade {
  balade: Balade
  score: number
  date: string
}

/**
 * Free, no-auth vector tile style hosted on OpenFreeMap (Cloudflare-backed).
 * Works in every browser including iOS Safari — no Mapbox token, no URL
 * restrictions, no quota gymnastics.
 */
const STYLE_URL = 'https://tiles.openfreemap.org/styles/positron'

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

type RenderState = 'loading' | 'live' | 'failed'

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
  const [renderState, setRenderState] = useState<RenderState>('loading')

  // 8s safety net — if the tile server is unreachable we still tell the user.
  useEffect(() => {
    if (renderState !== 'loading') return
    const t = setTimeout(() => {
      setRenderState((s) => (s === 'loading' ? 'failed' : s))
    }, 8000)
    return () => clearTimeout(t)
  }, [renderState])

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

  const initial = points[0]

  if (renderState === 'failed') {
    return (
      <div className="flex h-full min-h-[320px] flex-col items-center justify-center gap-3 rounded-2xl border border-amber-200/15 bg-black/40 p-6 text-center">
        <AlertTriangle size={24} className="text-amber-300" />
        <p className="text-sm text-amber-100/70">
          Carte temporairement indisponible.
        </p>
        <button
          onClick={() => setRenderState('loading')}
          className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs text-amber-300 transition hover:bg-amber-300/10"
        >
          <RefreshCw size={13} /> Réessayer
        </button>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[320px] overflow-hidden rounded-2xl border border-amber-200/15 bg-[#1a0f08]">
      <Map
        ref={mapRef}
        mapStyle={STYLE_URL}
        initialViewState={{
          longitude: initial?.lng ?? 2.3522,
          latitude: initial?.lat ?? 48.8566,
          zoom: initial ? 12 : 2.4,
        }}
        style={{ width: '100%', height: '100%' }}
        reuseMaps
        onLoad={() => {
          setRenderState('live')
          // Some iOS Safari setups mount the canvas at 0×0; force a resize
          // once the style is ready so the actual container size is picked up.
          requestAnimationFrame(() => mapRef.current?.resize())
        }}
        onError={(e) => {
          // eslint-disable-next-line no-console
          console.warn('[BaladeGlobe] map error', e.error?.message ?? e)
          setRenderState('failed')
        }}
      >
        {routeLine && (
          <Source id="route" type="geojson" data={routeLine}>
            <Layer
              id="route-line"
              type="line"
              paint={{
                'line-color':
                  selected?.balade.theme_color.secondary ?? '#b8860b',
                'line-width': 3,
                'line-opacity': 0.85,
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

      {renderState === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
          <p className="text-xs text-amber-100/60">Chargement de la carte…</p>
        </div>
      )}
    </div>
  )
}
