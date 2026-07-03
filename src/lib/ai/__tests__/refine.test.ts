import { describe, expect, it } from 'vitest'
import { applyRefinePatch, refineMaxTokens } from '@/lib/ai/refine'
import type { GeneratedBalade } from '@/lib/ai/generated'

function draft(): GeneratedBalade {
  return {
    title: 'T',
    theme_color: {},
    estimated_duration_min: 60,
    distance_km: 2,
    story_context: 'contexte',
    prologue: 'prologue',
    epilogue: 'épilogue',
    route_makes_sense: true,
    etapes: [
      {
        order: 1,
        location_name: 'Place A',
        lat: 1,
        lng: 2,
        story_text: 'récit',
        direction_text: 'tout droit',
        walk_minutes: 5,
        action_mission: 'mission',
        enigme: {
          type: 'anagram',
          title: 'É',
          instruction: 'i',
          cipher_display: 'ABC',
          hint: 'h',
          answer: 'CAB',
          answer_explanation: 'e',
        },
        medical_bonus: null,
      },
    ],
  }
}

describe('applyRefinePatch', () => {
  it('applies enigme fixes when the target is enabled', () => {
    const patch = JSON.stringify({
      fixes: [{ order: 1, enigme: { answer: 'BAC', cipher_display: 'CBA' } }],
    })
    const { balade, appliedFixes } = applyRefinePatch(draft(), patch, [
      'enigmes',
    ])
    expect(appliedFixes).toBe(1)
    expect(balade.etapes[0].enigme.answer).toBe('BAC')
    expect(balade.etapes[0].enigme.cipher_display).toBe('CBA')
  })

  it('ignores fields outside the enabled targets', () => {
    const patch = JSON.stringify({
      fixes: [
        { order: 1, enigme: { answer: 'BAC' }, location_name: 'Place B' },
      ],
      prologue: 'nouveau prologue',
    })
    const { balade, appliedFixes } = applyRefinePatch(draft(), patch, [
      'coherence',
    ])
    expect(appliedFixes).toBe(1)
    expect(balade.etapes[0].enigme.answer).toBe('CAB') // untouched
    expect(balade.etapes[0].location_name).toBe('Place B')
    expect(balade.prologue).toBe('prologue') // untouched
  })

  it('rewrites global prose only under the prose target', () => {
    const patch = JSON.stringify({ prologue: 'nouveau prologue' })
    const { balade } = applyRefinePatch(draft(), patch, ['prose'])
    expect(balade.prologue).toBe('nouveau prologue')
  })

  it('returns the draft untouched on unparseable patches', () => {
    const { balade, appliedFixes } = applyRefinePatch(
      draft(),
      'pas du JSON',
      ['enigmes'],
    )
    expect(appliedFixes).toBe(0)
    expect(balade).toEqual(draft())
  })

  it('ignores fixes for unknown étapes', () => {
    const patch = JSON.stringify({
      fixes: [{ order: 42, enigme: { answer: 'X' } }],
    })
    const { appliedFixes } = applyRefinePatch(draft(), patch, ['enigmes'])
    expect(appliedFixes).toBe(0)
  })
})

describe('refineMaxTokens', () => {
  it('stays within its floor and ceiling', () => {
    expect(refineMaxTokens(1)).toBeGreaterThanOrEqual(3000)
    expect(refineMaxTokens(100)).toBeLessThanOrEqual(12000)
  })
})
