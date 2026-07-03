import { describe, expect, it } from 'vitest'
import {
  applyDistancesAndTime,
  computeWalkBudget,
  haversineKm,
} from '@/lib/ai/routeMath'

describe('haversineKm', () => {
  it('is zero for identical points', () => {
    expect(haversineKm(48.8566, 2.3522, 48.8566, 2.3522)).toBe(0)
  })

  it('matches a known distance (1° of longitude at the equator)', () => {
    expect(haversineKm(0, 0, 0, 1)).toBeCloseTo(111.19, 1)
  })

  it('Paris → Lyon is ~392 km as the crow flies', () => {
    const km = haversineKm(48.8566, 2.3522, 45.764, 4.8357)
    expect(km).toBeGreaterThan(385)
    expect(km).toBeLessThan(400)
  })
})

describe('computeWalkBudget', () => {
  it('produces coherent, positive caps', () => {
    const b = computeWalkBudget(120, 5)
    expect(b.targetWalkKm).toBeGreaterThan(0)
    expect(b.budgetKm).toBeGreaterThanOrEqual(1.5)
    expect(b.legCapKm).toBeLessThanOrEqual(6)
    expect(b.centerCapKm).toBeGreaterThan(b.budgetKm)
    expect(b.maxLegWalkMin).toBeGreaterThan(0)
  })

  it('scales with the requested duration', () => {
    const short = computeWalkBudget(45, 4)
    const long = computeWalkBudget(240, 4)
    expect(long.budgetKm).toBeGreaterThan(short.budgetKm)
    expect(long.targetWalkKm).toBeGreaterThan(short.targetWalkKm)
  })
})

describe('applyDistancesAndTime', () => {
  it('recomputes walk minutes and totals from coordinates', () => {
    // Two stops ~1 km apart (0.008993° of latitude).
    const etapes = [
      { order: 2, lat: 48.8656, lng: 2.3522, walk_minutes: 99 },
      { order: 1, lat: 48.8566, lng: 2.3522, walk_minutes: 99 },
    ]
    const totals = applyDistancesAndTime(etapes)
    const first = etapes.find((e) => e.order === 1)!
    const second = etapes.find((e) => e.order === 2)!
    expect(first.walk_minutes).toBe(0)
    // ~1 km crow-flies × 1.3 urban detour × 12 min/km ≈ 16 min.
    expect(second.walk_minutes).toBeGreaterThanOrEqual(14)
    expect(second.walk_minutes).toBeLessThanOrEqual(18)
    expect(totals.distance_km).toBeCloseTo(1.3, 1)
    // Walk time + 10 min on site per étape.
    expect(totals.estimated_duration_min).toBe(second.walk_minutes + 20)
  })

  it('keeps a sane default when coordinates are missing', () => {
    const etapes = [
      { order: 1, lat: 48.8566, lng: 2.3522, walk_minutes: 99 },
      { order: 2, lat: NaN, lng: NaN, walk_minutes: 0 },
    ]
    const totals = applyDistancesAndTime(etapes)
    expect(etapes[1].walk_minutes).toBe(10)
    expect(totals.distance_km).toBe(0)
  })
})
