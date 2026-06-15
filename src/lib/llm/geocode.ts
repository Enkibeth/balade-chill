import 'server-only'

export interface GeocodedPlace {
  lat: number
  lng: number
  displayName: string
}

/**
 * Geocodes an address via Nominatim (OpenStreetMap, free, no key required).
 * Returns null on any failure — callers must treat the result as best-effort.
 * Usage policy: keep below ~1 req/s and include a descriptive User-Agent.
 */
export async function geocodeAddress(
  address: string,
): Promise<GeocodedPlace | null> {
  const q = address.trim()
  if (!q) return null
  const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(
    q,
  )}&format=json&limit=1&addressdetails=0`
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
    const first = data[0]
    if (!first) return null
    const lat = Number(first.lat)
    const lng = Number(first.lon)
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
    return { lat, lng, displayName: first.display_name }
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
