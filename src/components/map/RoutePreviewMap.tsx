'use client'

import 'leaflet/dist/leaflet.css'
import { useEffect } from 'react'
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet'
import L from 'leaflet'
import type { Etape } from '@/types'
import { useIsLight } from '@/hooks/useTheme'

function numberIcon(color: string, label: number) {
  return L.divIcon({
    className: '',
    html: `<div style="display:flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:9999px;background:${color};border:1.5px solid #fff;color:#fff;font-size:11px;font-weight:700;font-family:ui-sans-serif,system-ui,sans-serif;">${label}</div>`,
    iconSize: [22, 22],
    iconAnchor: [11, 11],
  })
}

function Fit({ points }: { points: [number, number][] }) {
  const map = useMap()
  useEffect(() => {
    const t = setTimeout(() => {
      map.invalidateSize()
      if (points.length === 1) {
        map.setView(points[0], 14)
      } else if (points.length > 1) {
        map.fitBounds(L.latLngBounds(points), { padding: [36, 36] })
      }
    }, 150)
    return () => clearTimeout(t)
    // Fit once on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  return null
}

/** Free (no-token) Leaflet/CARTO preview of a balade route. */
export function RoutePreviewMap({
  etapes,
  color,
}: {
  etapes: Etape[]
  color: string
}) {
  const light = useIsLight()
  const pts = [...etapes]
    .sort((a, b) => a.order - b.order)
    .filter((e) => Number.isFinite(e.lat) && Number.isFinite(e.lng))
  const positions = pts.map((e) => [e.lat, e.lng] as [number, number])

  if (positions.length === 0) {
    return (
      <div className="rounded-2xl border border-amber-200/15 bg-black/30 p-4 text-center text-xs text-amber-100/40">
        Aperçu cartographique indisponible (coordonnées manquantes).
      </div>
    )
  }

  return (
    <div className="h-56 overflow-hidden rounded-2xl border border-amber-200/15">
      <MapContainer
        center={positions[0]}
        zoom={13}
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
        <Fit points={positions} />
        {positions.length >= 2 && (
          <Polyline
            positions={positions}
            pathOptions={{ color, weight: 3, opacity: 0.85 }}
          />
        )}
        {pts.map((e) => (
          <Marker
            key={e.id}
            position={[e.lat, e.lng]}
            icon={numberIcon(color, e.order)}
          />
        ))}
      </MapContainer>
    </div>
  )
}
