import 'server-only'

import { haversineKm } from '@/lib/llm/routeMath'

export interface GeocodedPlace {
  lat: number
  lng: number
  displayName: string
}

export interface GeocodeOptions {
  /**
   * Bias candidate selection toward this point: among the results returned for
   * an (often ambiguous) name, the closest one is chosen. Use the model's own
   * coordinate so "Mairie" or "Place de l'Église" resolves to the intended one,
   * not a same-named place across town.
   */
  near?: { lat: number; lng: number }
  /** How many candidates to fetch (default 1; raise to a few when using `near`). */
  limit?: number
}

/**
 * Geocodes an address via Nominatim (OpenStreetMap, free, no key required).
 * Returns null on any failure — callers must treat the result as best-effort.
 * Usage policy: keep below ~1 req/s and include a descriptive User-Agent.
 */
export async function geocodeAddress(
  address: string,
  opts: GeocodeOptions = {},
): Promise<GeocodedPlace | null> {
  const q = address.trim()
  if (!q) return null
  const limit = Math.min(Math.max(opts.limit ?? 1, 1), 10)
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    q,
  )}&format=json&limit=${limit}&addressdetails=0`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'BaladeChill/1.0 (https://github.com/h23902390/balade-chill)',
        'Accept-Language': 'fr',
      },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as Array<{
      lat: string
      lon: string
      display_name: string
    }>
    const places: GeocodedPlace[] = data
      .map((d) => ({
        lat: Number(d.lat),
        lng: Number(d.lon),
        displayName: d.display_name,
      }))
      .filter((p) => Number.isFinite(p.lat) && Number.isFinite(p.lng))
    if (places.length === 0) return null
    // With an anchor, prefer the nearest candidate; otherwise Nominatim already
    // sorts by relevance, so the first result wins.
    if (opts.near) {
      const { lat, lng } = opts.near
      places.sort(
        (a, b) =>
          haversineKm(lat, lng, a.lat, a.lng) -
          haversineKm(lat, lng, b.lat, b.lng),
      )
    }
    return places[0]
  } catch {
    return null
  }
}

/** Picks a short, human-friendly label out of a Nominatim display_name. */
export function shortenDisplayName(displayName: string): string {
  return displayName.split(',').slice(0, 2).join(',').trim()
}

/**
 * Reverse-geocodes a coordinate to a real place name via Nominatim, so a point
 * dropped on the map carries an exact location name (not just raw lat/lng).
 * Returns null on any failure — callers treat it as best-effort.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<GeocodedPlace | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lng}&format=json&zoom=18&addressdetails=0`
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'BaladeChill/1.0 (https://github.com/h23902390/balade-chill)',
        'Accept-Language': 'fr',
      },
      cache: 'no-store',
    })
    if (!res.ok) return null
    const data = (await res.json()) as {
      lat?: string
      lon?: string
      display_name?: string
      name?: string
    }
    if (!data?.display_name) return null
    // Prefer the precise POI/road name when Nominatim provides one.
    const displayName =
      data.name && data.name.trim()
        ? `${data.name}, ${data.display_name}`
        : data.display_name
    return { lat, lng, displayName }
  } catch {
    return null
  }
}
