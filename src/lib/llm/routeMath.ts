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
const WALK_SPEED_KMH = 5
const URBAN_DETOUR = 1.3
const MIN_PER_KM = 12
const ON_SITE_MIN = 10
// Headroom for occasional bike/transit hops + model imprecision, while still
// catching anything that clearly isn't doable on foot in the target time.
const TOLERANCE = 1.75
// A single walking leg beyond this (~75 min on foot) is treated as a jump.
const LEG_HARD_CAP_KM = 6
const MIN_TOTAL_KM = 1.5

const round1 = (n: number) => Math.round(n * 10) / 10

export interface WalkBudget {
  /** Crow-flies total ceiling (km) — the validator's route budget. */
  budgetKm: number
  /** Crow-flies per-leg ceiling (km). */
  legCapKm: number
  /** Crow-flies distance-from-centre ceiling (km). */
  centerCapKm: number
  /** Realistic *walking* distance to target over the whole route (km). */
  targetWalkKm: number
  /** Realistic *walking* distance between two consecutive étapes (km). */
  maxLegWalkKm: number
  /** Realistic walk time between two consecutive étapes (min). */
  maxLegWalkMin: number
  /** Radius (walking km) all étapes should stay within of the start. */
  radiusWalkKm: number
}

/**
 * Single source of truth for how far a balade may reasonably span on foot.
 * Used both to gate generated itineraries (validateEtapeGeography) and to tell
 * the model — up front, in concrete numbers — how close to keep its étapes.
 * Crow-flies ceilings drive validation; the *walk* figures are what we hand to
 * the model, deliberately tighter than the ceilings so legitimate routes keep a
 * safe margin and aren't rejected.
 */
export function computeWalkBudget(
  durationTargetMin: number,
  nbEtapes: number,
): WalkBudget {
  const steps = Math.max(1, Math.round(nbEtapes))
  const movingMin = Math.max(15, durationTargetMin - ON_SITE_MIN * steps)
  const walkableKm = (movingMin / 60) * WALK_SPEED_KMH
  const budgetKm = Math.max(MIN_TOTAL_KM, (walkableKm / URBAN_DETOUR) * TOLERANCE)
  const legCapKm = Math.min(LEG_HARD_CAP_KM, Math.max(2, budgetKm))
  const centerCapKm = Math.max(budgetKm, legCapKm) * 1.5 + 1

  const legs = Math.max(1, steps - 1)
  const maxLegWalkKm = Math.min(
    legCapKm * URBAN_DETOUR,
    Math.max(0.5, (walkableKm / legs) * 1.6),
  )
  return {
    budgetKm: round1(budgetKm),
    legCapKm: round1(legCapKm),
    centerCapKm: round1(centerCapKm),
    targetWalkKm: round1(walkableKm),
    maxLegWalkKm: round1(maxLegWalkKm),
    maxLegWalkMin: Math.round(maxLegWalkKm * MIN_PER_KM),
    radiusWalkKm: round1(Math.max(0.6, walkableKm / 2)),
  }
}

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
