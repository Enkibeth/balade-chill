import type {
  BonusCategory,
  Difficulty,
  QuizOption,
  QuizQuestion,
} from '@/types'
import type {
  PickPoint,
  StartEndValue,
} from '@/components/map/StartEndPicker'

/**
 * Brouillon du formulaire de génération (/generate), auto-sauvegardé en
 * localStorage pendant la saisie. Si la génération plante ou que la page se
 * ferme, l'utilisateur retrouve tous ses réglages au retour. Purgé quand une
 * balade est générée avec succès.
 */
export interface GenerationDraft {
  savedAt: number
  step: number
  city: string
  country: string
  duration: number
  nbEtapes: number
  difficulty: Difficulty
  specialties: string[]
  theme: string
  specialInstructions: string
  bonusThemes: BonusCategory[]
  bonusCustom: string
  startEnd: StartEndValue
  quiz: QuizQuestion[] | null
  quizAnswers: Record<string, string>
}

// Versionné : si la forme du brouillon change, incrémenter le suffixe pour
// que les anciens brouillons soient simplement ignorés.
export const GENERATION_DRAFT_KEY = 'balade-chill:generation-draft:v1'

const DIFFICULTIES: Difficulty[] = ['facile', 'moyen', 'difficile', 'boss']
const BONUS_IDS: BonusCategory[] = [
  'medical',
  'histoire',
  'anecdote_fun',
  'science',
  'blague',
  'custom',
]

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}

function clampInt(v: unknown, min: number, max: number, fallback: number) {
  if (typeof v !== 'number' || !Number.isFinite(v)) return fallback
  return Math.min(max, Math.max(min, Math.round(v)))
}

function parsePoint(v: unknown): PickPoint | null {
  if (!isRecord(v)) return null
  const { lat, lng, label } = v
  if (typeof lat !== 'number' || !Number.isFinite(lat)) return null
  if (typeof lng !== 'number' || !Number.isFinite(lng)) return null
  return {
    lat,
    lng,
    ...(typeof label === 'string' ? { label } : {}),
  }
}

function parseStartEnd(v: unknown): StartEndValue {
  const fallback: StartEndValue = { start: null, end: null, loop: true }
  if (!isRecord(v)) return fallback
  return {
    start: parsePoint(v.start),
    end: parsePoint(v.end),
    loop: typeof v.loop === 'boolean' ? v.loop : true,
  }
}

function parseQuiz(v: unknown): QuizQuestion[] | null {
  if (!Array.isArray(v)) return null
  const questions: QuizQuestion[] = []
  for (const q of v) {
    if (!isRecord(q)) return null
    if (typeof q.id !== 'string' || typeof q.label !== 'string') return null
    if (!Array.isArray(q.options)) return null
    const options: QuizOption[] = []
    for (const o of q.options) {
      if (!isRecord(o)) return null
      if (typeof o.id !== 'string' || typeof o.label !== 'string') return null
      options.push({ id: o.id, label: o.label })
    }
    questions.push({ id: q.id, label: q.label, options })
  }
  return questions.length ? questions : null
}

function parseQuizAnswers(v: unknown): Record<string, string> {
  if (!isRecord(v)) return {}
  const out: Record<string, string> = {}
  for (const [key, val] of Object.entries(v)) {
    if (typeof val === 'string') out[key] = val
  }
  return out
}

/**
 * Assainit un brouillon déjà désérialisé (payload jsonb Supabase, objet
 * quelconque). Chaque champ invalide retombe sur la valeur par défaut du
 * formulaire ; retourne null si le contenu n'est pas exploitable du tout.
 */
export function sanitizeGenerationDraft(data: unknown): GenerationDraft | null {
  if (!isRecord(data) || typeof data.city !== 'string') return null

  const difficulty = data.difficulty as Difficulty
  const bonusThemes = Array.isArray(data.bonusThemes)
    ? (data.bonusThemes.filter((t) =>
        BONUS_IDS.includes(t as BonusCategory),
      ) as BonusCategory[])
    : ['medical' as BonusCategory]

  return {
    savedAt:
      typeof data.savedAt === 'number' && Number.isFinite(data.savedAt)
        ? data.savedAt
        : Date.now(),
    step: clampInt(data.step, 1, 4, 1),
    city: data.city,
    country: asString(data.country, 'France'),
    duration: clampInt(data.duration, 45, 240, 120),
    nbEtapes: clampInt(data.nbEtapes, 3, 6, 5),
    difficulty: DIFFICULTIES.includes(difficulty) ? difficulty : 'difficile',
    specialties: Array.isArray(data.specialties)
      ? data.specialties.filter((s): s is string => typeof s === 'string')
      : ['cardiologie', 'neurologie'],
    theme: asString(data.theme),
    specialInstructions: asString(data.specialInstructions),
    bonusThemes,
    bonusCustom: asString(data.bonusCustom),
    startEnd: parseStartEnd(data.startEnd),
    quiz: parseQuiz(data.quiz),
    quizAnswers: parseQuizAnswers(data.quizAnswers),
  }
}

/**
 * Désérialise et assainit un brouillon lu depuis localStorage (JSON brut).
 * Retourne null si le JSON est cassé ou la forme inexploitable.
 */
export function parseGenerationDraft(raw: string | null): GenerationDraft | null {
  if (!raw) return null
  try {
    return sanitizeGenerationDraft(JSON.parse(raw))
  } catch {
    return null
  }
}
