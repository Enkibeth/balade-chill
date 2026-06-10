import 'server-only'
import { computeWalkBudget, haversineKm } from './routeMath'
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

  // Same budget the generation prompt is built from, so the model is asked to
  // respect exactly what this gate enforces.
  const { budgetKm, legCapKm: legCap, centerCapKm: centerCap } =
    computeWalkBudget(opts.durationTargetMin, sorted.length)

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
