import type { BonusCategory, MedicalBonus } from '@/types'

/**
 * Catalog of the bonus-question themes a balade can mix in. Shared between the
 * generation UI (chips) and the prompt builders so the labels, ids and guidance
 * stay in sync. Importable from both client and server (no 'server-only').
 */
export interface BonusCategoryDef {
  id: BonusCategory
  /** Short UI label for the selection chip. */
  label: string
  /** One-line description shown under the chip. */
  desc: string
  /** Emoji used in the rendered bonus block. */
  emoji: string
  /** Section title shown above the rendered bonus block. */
  blockTitle: string
  /** Default badge text when the model omits a "label". */
  defaultBadge: string
  /** Instructions injected into the generation prompt for this theme. */
  guidance: string
}

export const BONUS_CATEGORIES: BonusCategoryDef[] = [
  {
    id: 'medical',
    label: 'Médecine (D5)',
    desc: 'Questions cliniques niveau 5e année',
    emoji: '🩺',
    blockTitle: 'Bonus médecine',
    defaultBadge: 'Médecine',
    guidance:
      "Question clinique exigeante de niveau D5 (5e année de médecine), même si la balade est facile. Le raisonnement clinique complet figure dans \"answer\". Privilégie les spécialités demandées et glisse au moins une question piège d'ECG ou de prise en charge d'AVC dans la balade. Mets dans \"label\" la spécialité (ex. \"Cardiologie\").",
  },
  {
    id: 'histoire',
    label: 'Histoire & patrimoine',
    desc: 'Le lieu, son passé, ses secrets',
    emoji: '🏛️',
    blockTitle: 'Le coin de l’Histoire',
    defaultBadge: 'Histoire',
    guidance:
      "Question ou anecdote historique réelle liée au lieu de l'étape (événement, personnage, origine du nom, architecture). \"answer\" donne la réponse et un court éclairage. Mets \"Histoire\" dans \"label\".",
  },
  {
    id: 'anecdote_fun',
    label: 'Anecdotes fun',
    desc: 'Le saviez-vous insolite et amusant',
    emoji: '✨',
    blockTitle: 'Le saviez-vous ?',
    defaultBadge: 'Anecdote',
    guidance:
      "Anecdote insolite, amusante ou surprenante en lien avec le lieu de l'étape. Question légère de type « le saviez-vous ? ». \"answer\" révèle l'anecdote avec un ton enjoué. Mets \"Anecdote\" dans \"label\".",
  },
  {
    id: 'science',
    label: 'Anecdotes scientifiques',
    desc: 'Physique, nature, astronomie…',
    emoji: '🔬',
    blockTitle: 'Une pause science',
    defaultBadge: 'Science',
    guidance:
      "Fait ou question scientifique (physique, biologie, astronomie, nature), en lien avec le lieu quand c'est possible. \"answer\" explique simplement et clairement. Mets \"Science\" dans \"label\".",
  },
  {
    id: 'blague',
    label: 'Blagues & devinettes',
    desc: 'Pour rire et faire sourire',
    emoji: '😄',
    blockTitle: 'Le mot pour rire',
    defaultBadge: 'Blague',
    guidance:
      "Une blague, un jeu de mots ou une petite devinette amusante pour faire sourire. \"question\" pose la blague ou la devinette, \"answer\" donne la chute ou la solution. Mets \"Blague\" dans \"label\".",
  },
  {
    id: 'custom',
    label: 'Thème libre',
    desc: 'Saisis ton propre thème',
    emoji: '🎲',
    blockTitle: 'Question bonus',
    defaultBadge: 'Bonus',
    guidance:
      'Question bonus sur le thème personnalisé indiqué par le joueur. \"answer\" donne la réponse et une courte explication. Mets un court intitulé du thème dans \"label\".',
  },
]

export const BONUS_CATEGORY_IDS: BonusCategory[] = BONUS_CATEGORIES.map(
  (c) => c.id,
)

export function bonusCategoryDef(
  id: BonusCategory | string | undefined,
): BonusCategoryDef {
  return (
    BONUS_CATEGORIES.find((c) => c.id === id) ?? BONUS_CATEGORIES[0] // default: medical
  )
}

export function isBonusCategory(v: unknown): v is BonusCategory {
  return typeof v === 'string' && BONUS_CATEGORY_IDS.includes(v as BonusCategory)
}

/**
 * Resolves a stored bonus to its category, defaulting to "medical" for balades
 * created before themed bonuses existed (those rows have only "specialty").
 */
export function resolveBonusCategory(bonus: {
  category?: BonusCategory | string
}): BonusCategory {
  return isBonusCategory(bonus.category) ? bonus.category : 'medical'
}

/** Badge text for a bonus block: explicit label, then specialty, then default. */
export function bonusBadge(bonus: Pick<MedicalBonus, 'label' | 'specialty' | 'category'>): string {
  if (bonus.label && bonus.label.trim()) return bonus.label.trim()
  if (bonus.specialty) return bonus.specialty
  return bonusCategoryDef(resolveBonusCategory(bonus)).defaultBadge
}
