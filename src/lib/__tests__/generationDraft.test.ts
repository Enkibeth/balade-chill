import { describe, expect, it } from 'vitest'
import {
  parseGenerationDraft,
  type GenerationDraft,
} from '@/lib/generationDraft'

function validDraft(): GenerationDraft {
  return {
    savedAt: 1751900000000,
    step: 4,
    city: 'Lyon',
    country: 'France',
    duration: 90,
    nbEtapes: 4,
    difficulty: 'moyen',
    specialties: ['cardiologie'],
    theme: 'Renaissance',
    specialInstructions: 'Éviter les grands axes',
    bonusThemes: ['medical', 'histoire'],
    bonusCustom: '',
    startEnd: {
      start: { lat: 45.76, lng: 4.83, label: 'Place Bellecour' },
      end: null,
      loop: true,
    },
    quiz: [
      {
        id: 'q1',
        label: 'Quel quartier préfères-tu ?',
        options: [
          { id: 'a', label: 'Vieux Lyon' },
          { id: 'b', label: 'Croix-Rousse' },
        ],
      },
    ],
    quizAnswers: { q1: 'a' },
  }
}

describe('parseGenerationDraft', () => {
  it('restitue à l’identique un brouillon valide (aller-retour)', () => {
    const draft = validDraft()
    expect(parseGenerationDraft(JSON.stringify(draft))).toEqual(draft)
  })

  it('retourne null pour une entrée absente, du JSON cassé ou une mauvaise forme', () => {
    expect(parseGenerationDraft(null)).toBeNull()
    expect(parseGenerationDraft('')).toBeNull()
    expect(parseGenerationDraft('{oops')).toBeNull()
    expect(parseGenerationDraft('"une string"')).toBeNull()
    expect(parseGenerationDraft('[1,2]')).toBeNull()
    // city manquante ou du mauvais type → brouillon inexploitable
    expect(parseGenerationDraft('{}')).toBeNull()
    expect(parseGenerationDraft(JSON.stringify({ city: 42 }))).toBeNull()
  })

  it('borne les valeurs numériques hors limites', () => {
    const draft = {
      ...validDraft(),
      step: 99,
      duration: 10,
      nbEtapes: 50,
    }
    const parsed = parseGenerationDraft(JSON.stringify(draft))!
    expect(parsed.step).toBe(4)
    expect(parsed.duration).toBe(45)
    expect(parsed.nbEtapes).toBe(6)
  })

  it('retombe sur les défauts du formulaire pour les champs invalides', () => {
    const parsed = parseGenerationDraft(
      JSON.stringify({
        city: 'Paris',
        step: 'trois',
        difficulty: 'impossible',
        specialties: 'cardiologie',
        bonusThemes: ['medical', 'inexistant', 42],
        startEnd: { start: { lat: 'nord', lng: 2 }, loop: 'oui' },
        quiz: [{ id: 'q1' }],
        quizAnswers: { q1: 'a', q2: 3 },
      }),
    )!
    expect(parsed.step).toBe(1)
    expect(parsed.city).toBe('Paris')
    expect(parsed.country).toBe('France')
    expect(parsed.difficulty).toBe('difficile')
    expect(parsed.specialties).toEqual(['cardiologie', 'neurologie'])
    expect(parsed.bonusThemes).toEqual(['medical'])
    expect(parsed.startEnd).toEqual({ start: null, end: null, loop: true })
    expect(parsed.quiz).toBeNull()
    expect(parsed.quizAnswers).toEqual({ q1: 'a' })
  })

  it('rejette un quiz partiellement corrompu plutôt que de le tronquer', () => {
    const draft = {
      ...validDraft(),
      quiz: [
        validDraft().quiz![0],
        { id: 'q2', label: 'Cassée', options: [{ id: 'a' }] },
      ],
    }
    expect(parseGenerationDraft(JSON.stringify(draft))!.quiz).toBeNull()
  })

  it('génère un savedAt de secours quand il manque', () => {
    const rest: Partial<GenerationDraft> = validDraft()
    delete rest.savedAt
    const before = Date.now()
    const parsed = parseGenerationDraft(JSON.stringify(rest))!
    expect(parsed.savedAt).toBeGreaterThanOrEqual(before)
  })
})
