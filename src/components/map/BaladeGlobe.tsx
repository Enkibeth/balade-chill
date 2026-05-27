'use client'

import 'mapbox-gl/dist/mapbox-gl.css'
import { useEffect, useMemo, useRef, useState } from 'react'
import Map, {
  Marker,
  Popup,
  Source,
  Layer,
  type MapRef,
} from 'react-map-gl/mapbox'
import { RefreshCw, AlertTriangle } from 'lucide-react'
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
  points: Array<{ lat: number; lng: number; color: string }>,
  token: string,
): string | null {
  if (!token) return null
  const overlay = points
    .slice(0, 40)
    .map((p) => `pin-s+${p.color.replace('#', '')}(${p.lng},${p.lat})`)
    .join(',')
  const prefix = overlay ? `${overlay}/` : ''
  const center = points[0]
    ? `${points[0].lng},${points[0].lat},9`
    : '2.3522,48.8566,2'
  return `https://api.mapbox.com/styles/v1/mapbox/dark-v11/static/${prefix}${
    overlay ? 'auto' : center
  }/1200x800@2x?padding=64&access_token=${token}`
}

type RenderState = 'loading' | 'live' | 'failed'

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
  const mapRef = useRef<MapRef>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  // Default to mercator — iOS Safari has WebGL issues with globe.
  // Promote to globe on capable browsers after mount.
  const [projectionName, setProjectionName] = useState<'globe' | 'mercator'>(
    'mercator',
  )
  const [renderState, setRenderState] = useState<RenderState>('loading')

  useEffect(() => {
    const ua = navigator.userAgent
    const isIOS = /iPhone|iPad|iPod/i.test(ua)
    const prefersReducedMotion = window.matchMedia(
      '(prefers-reduced-motion: reduce)',
    ).matches
    setProjectionName(isIOS || prefersReducedMotion ? 'mercator' : 'globe')
  }, [])

  // If the map never finishes loading within 8s, drop back to a static image.
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
          return c
            ? { ...it, ...c, color: it.balade.theme_color.primary }
            : null
        })
        .filter(
          (
            p,
          ): p is GlobeBalade & { lat: number; lng: number; color: string } =>
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

  const staticUrl = useMemo(
    () => staticOverviewUrl(points, mapboxToken ?? ''),
    [points, mapboxToken],
  )

  function flyTo(lng: number, lat: number, zoom: number) {
    mapRef.current?.flyTo({ center: [lng, lat], zoom, duration: 1400 })
  }

  if (!mapboxToken) {
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

  // Static-image fallback when the interactive map fails.
  if (renderState === 'failed') {
    return (
      <div className="relative h-full min-h-[320px] overflow-hidden rounded-2xl border border-amber-200/15 bg-black/60">
        {staticUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={staticUrl}
            alt="Aperçu statique des balades"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center p-6 text-center text-sm text-amber-100/50">
            Aucune balade à afficher.
          </div>
        )}
        <div className="absolute inset-x-3 top-3 flex items-start gap-2 rounded-lg border border-amber-200/20 bg-black/75 p-2.5 text-[11px] text-amber-100/85 backdrop-blur">
          <AlertTriangle size={13} className="mt-0.5 shrink-0 text-amber-300" />
          <span className="flex-1">
            Carte interactive indisponible — affichage statique.
          </span>
          <button
            onClick={() => setRenderState('loading')}
            className="inline-flex items-center gap-1 rounded bg-amber-300 px-2 py-0.5 text-amber-950"
          >
            <RefreshCw size={11} /> Réessayer
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="relative h-full min-h-[320px] overflow-hidden rounded-2xl border border-amber-200/15 bg-black">
      <Map
        ref={mapRef}
        mapboxAccessToken={mapboxToken}
        mapStyle="mapbox://styles/mapbox/dark-v11"
        projection={{ name: projectionName }}
        initialViewState={{
          longitude: initial?.lng ?? 2.3522,
          latitude: initial?.lat ?? 48.8566,
          zoom: initial ? 9 : 2.4,
        }}
        style={{ width: '100%', height: '100%' }}
        reuseMaps
        onLoad={() => {
          setRenderState('live')
          // iOS Safari sometimes mounts the canvas at 0×0 — force a resize
          // once the map is loaded so the container's actual size is picked up.
          requestAnimationFrame(() => mapRef.current?.resize())
        }}
        onError={(e) => {
          console.warn('[BaladeGlobe] mapbox error', e.error?.message ?? e)
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

      {renderState === 'loading' && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm">
          <p className="text-xs text-amber-100/60">Chargement de la carte…</p>
        </div>
      )}
    </div>
  )
}
