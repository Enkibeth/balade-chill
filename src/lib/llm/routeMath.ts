import type { GeneratedEtape } from './generated'

/** Great-circle distance in km between two GPS points. */
export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number,
): number {
  const R = 6371
  const toRad = (d: number) => (d * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) *
      Math.cos(toRad(lat2)) *
      Math.sin(dLng / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// Walking speed ~5 km/h → 12 min/km. Urban walking detour vs crow-flies ~1.3x.
const URBAN_DETOUR = 1.3
const MIN_PER_KM = 12
const ON_SITE_MIN = 10

/**
 * Replaces the model-guessed per-étape walk times and the balade-level
 * distance/duration with values computed deterministically from the étape
 * coordinates. Mutates the étape objects' walk_minutes in place.
 */
export function applyDistancesAndTime(etapes: GeneratedEtape[]): {
  distance_km: number
  estimated_duration_min: number
} {
  const sorted = [...etapes].sort((a, b) => a.order - b.order)
  let totalKm = 0
  for (let i = 0; i < sorted.length; i++) {
    if (i === 0) {
      sorted[i].walk_minutes = 0
      continue
    }
    const prev = sorted[i - 1]
    const cur = sorted[i]
    const validCoords =
      Number.isFinite(prev.lat) &&
      Number.isFinite(prev.lng) &&
      Number.isFinite(cur.lat) &&
      Number.isFinite(cur.lng)
    if (!validCoords) {
      sorted[i].walk_minutes = sorted[i].walk_minutes || 10
      continue
    }
    const legKm = haversineKm(prev.lat, prev.lng, cur.lat, cur.lng) * URBAN_DETOUR
    sorted[i].walk_minutes = Math.max(1, Math.round(legKm * MIN_PER_KM))
    totalKm += legKm
  }
  const walk = sorted.reduce((s, e) => s + (e.walk_minutes || 0), 0)
  return {
    distance_km: Math.round(totalKm * 10) / 10,
    estimated_duration_min: Math.round(walk + sorted.length * ON_SITE_MIN),
  }
}
