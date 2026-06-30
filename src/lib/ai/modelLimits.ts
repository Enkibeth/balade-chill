import type { Difficulty } from '@/types'

export function getModelOutputBudget(input: { model: string; difficulty: Difficulty; generationMode: 'full' | 'segmented' | 'lazy' }): number {
  const m = input.model.toLowerCase()
  const base = m.includes('haiku') ? 12000 : m.includes('sonnet') ? 16000 : 20000
  const mult = input.difficulty === 'facile' ? 0.6 : input.difficulty === 'moyen' ? 0.85 : input.difficulty === 'difficile' ? 1 : 1
  const modeFactor = input.generationMode === 'lazy' ? 0.6 : 1
  return Math.max(4000, Math.round(base * mult * modeFactor))
}
