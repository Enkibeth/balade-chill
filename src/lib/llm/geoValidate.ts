import 'server-only'
import { haversineKm } from './routeMath'
import type { GeneratedEtape } from './generated'

export interface GeoValidationResult {
  ok: boolean
  reason?: 'far_from_center' | 'leg_too_long'
  maxDistanceFromCenterKm: number
  maxLegKm: number
  offendingOrder?: number
}

/**
 * Caps tuned so they only trip on clear coordinate hallucinations — the kind of
 * garbage GPS that turns a city stroll into a 300-600 km "walk". Legitimate
 * city spread (even large metros + suburbs) stays well under these values.
 */
const MAX_RADIUS_FROM_CENTER_KM = 35
const MAX_LEG_KM = 20

/**
 * Sanity-checks étape coordinates against the city centre. The balade distance
 * is computed deterministically from these coordinates (see routeMath), so a
 * single hallucinated lat/lng silently produces an absurd total. Catching it
 * here lets the route reject the draft with an actionable message instead of
 * persisting a broken itinerary.
 */
export function validateEtapeGeography(
  etapes: GeneratedEtape[],
  center: { lat: number; lng: number },
): GeoValidationResult {
  const sorted = [...etapes].sort((a, b) => a.order - b.order)
  let maxFromCenter = 0
  let maxLeg = 0
  let offendingOrder: number | undefined
  let reason: GeoValidationResult['reason']
  let prev: GeneratedEtape | null = null

  for (const e of sorted) {
    if (!Number.isFinite(e.lat) || !Number.isFinite(e.lng)) {
      prev = e
      continue
    }
    const fromCenter = haversineKm(center.lat, center.lng, e.lat, e.lng)
    if (fromCenter > maxFromCenter) maxFromCenter = fromCenter
    if (fromCenter > MAX_RADIUS_FROM_CENTER_KM && offendingOrder === undefined) {
      offendingOrder = e.order
      reason = 'far_from_center'
    }
    if (prev && Number.isFinite(prev.lat) && Number.isFinite(prev.lng)) {
      const leg = haversineKm(prev.lat, prev.lng, e.lat, e.lng)
      if (leg > maxLeg) maxLeg = leg
      if (leg > MAX_LEG_KM && offendingOrder === undefined) {
        offendingOrder = e.order
        reason = 'leg_too_long'
      }
    }
    prev = e
  }

  return {
    ok: offendingOrder === undefined,
    reason,
    maxDistanceFromCenterKm: Math.round(maxFromCenter * 10) / 10,
    maxLegKm: Math.round(maxLeg * 10) / 10,
    offendingOrder,
  }
}
