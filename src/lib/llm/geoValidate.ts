import 'server-only'
import { haversineKm } from './routeMath'
import type { GeneratedEtape } from './generated'

export interface GeoValidationResult {
  ok: boolean
  reason?: 'route_too_long' | 'leg_too_long' | 'far_from_center'
  routeKm: number
  maxLegKm: number
  maxDistanceFromCenterKm: number
  budgetKm: number
  offendingOrder?: number
}

// Kept in sync with routeMath so the budget matches how distance/time are
// actually computed downstream.
const WALK_SPEED_KMH = 5
const URBAN_DETOUR = 1.3
const ON_SITE_MIN = 10
// Headroom for occasional bike/transit hops + model imprecision, while still
// catching anything that clearly isn't doable on foot in the target time.
const TOLERANCE = 1.75
// A single walking leg beyond this (~75 min on foot) is treated as a jump, not
// a stroll — almost always a hallucinated coordinate.
const LEG_HARD_CAP_KM = 6
const MIN_TOTAL_KM = 1.5

/**
 * Checks that an itinerary is plausibly *walkable* in the requested time.
 *
 * The balade distance is derived deterministically from the étape coordinates
 * (see routeMath), so a single hallucinated lat/lng silently turns a city
 * stroll into a multi-dozen-km "walk". This is the core "faisable à pied"
 * gate: it compares the total crow-flies path against what one can actually
 * cover on foot in `durationTargetMin`, plus a per-leg ceiling and a loose
 * distance-from-centre backstop. All caps scale with the duration, not a fixed
 * number — a 45-min balade is held to a far tighter span than a 4-hour one.
 */
export function validateEtapeGeography(
  etapes: GeneratedEtape[],
  center: { lat: number; lng: number },
  opts: { durationTargetMin: number },
): GeoValidationResult {
  const sorted = [...etapes].sort((a, b) => a.order - b.order)

  // Minutes actually spent moving (the rest is spent on-site solving énigmes).
  const movingMin = Math.max(15, opts.durationTargetMin - ON_SITE_MIN * sorted.length)
  const walkableKm = (movingMin / 60) * WALK_SPEED_KMH
  // Legs below are crow-flies; real walking is ~1.3x longer, so convert the
  // walkable distance back into a crow-flies budget before comparing.
  const budgetKm = Math.max(MIN_TOTAL_KM, (walkableKm / URBAN_DETOUR) * TOLERANCE)
  const legCap = Math.min(LEG_HARD_CAP_KM, Math.max(2, budgetKm))
  const centerCap = Math.max(budgetKm, legCap) * 1.5 + 1

  let routeKm = 0
  let maxLeg = 0
  let maxFromCenter = 0
  let offendingOrder: number | undefined
  let reason: GeoValidationResult['reason']
  let prev: GeneratedEtape | null = null

  const flag = (r: GeoValidationResult['reason'], order: number) => {
    if (offendingOrder === undefined) {
      offendingOrder = order
      reason = r
    }
  }

  for (const e of sorted) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) {
      prev = e
      continue
    }
    const fromCenter = haversineKm(center.lat, center.lng, e.lat, e.lng)
    if (fromCenter > maxFromCenter) maxFromCenter = fromCenter
    if (fromCenter > centerCap) flag('far_from_center', e.order)

    if (prev && Number.isFinite(prev.lat) && Number.isFinite(prev.lng)) {
      const leg = haversineKm(prev.lat, prev.lng, e.lat, e.lng)
      routeKm += leg
      if (leg > maxLeg) maxLeg = leg
      if (leg > legCap) flag('leg_too_long', e.order)
    }
    prev = e
  }

  if (routeKm > budgetKm) flag('route_too_long', sorted[sorted.length - 1]?.order ?? 0)

  return {
    ok: offendingOrder === undefined,
    reason,
    routeKm: Math.round(routeKm * 10) / 10,
    maxLegKm: Math.round(maxLeg * 10) / 10,
    maxDistanceFromCenterKm: Math.round(maxFromCenter * 10) / 10,
    budgetKm: Math.round(budgetKm * 10) / 10,
    offendingOrder,
  }
}
