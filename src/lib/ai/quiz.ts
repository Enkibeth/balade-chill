import type { Difficulty, QuizQuestion } from '@/types'

export const QUIZ_SYSTEM_PROMPT = `Tu es un assistant qui prépare la génération d'une balade urbaine à énigmes pour un couple. Tu génères de 4 à 6 questions à choix multiple, en français, **adaptées à la ville, au pays et à la durée demandée**, dont les réponses vont orienter la création de la balade.

Couvre les thèmes utiles (varie selon le contexte) :
- Boucle (départ = arrivée) ou point-à-point
- Mode de déplacement (à pied uniquement / mixte transports en commun / vélo / inclure des passages en métro)
- Pause restauration (oui/non/à quel moment/quel type)
- Quartier ou zone géographique préférée (suggère des quartiers RÉELS de la ville)
- Ambiance souhaitée (animée / calme / patrimoine / nature / nocturne)
- Moment de la journée (matinée / après-midi / soir)
- Niveau de marche acceptable (selon la durée demandée)

## TA RÉPONSE
Réponds UNIQUEMENT avec un objet JSON valide. Premier caractère "{", dernier "}". Pas de texte autour, pas de markdown.

## FORMAT
{
  "questions": [
    {
      "id": "short-snake-case-id",
      "label": "Question en français, courte et claire",
      "options": [
        { "id": "opt-id", "label": "Option courte" },
        { "id": "opt-id-2", "label": "Option courte" }
      ]
    }
  ]
}

## RÈGLES
- Entre 4 et 6 questions au total.
- Entre 2 et 4 options par question, courtes (≤ 6 mots).
- Adapte les options à la ville (quartiers réels, repères locaux) et à la durée (sois cohérent).
- Pas de question redondante avec la difficulté ou le thème déjà demandés.
- Reste en français.`

export interface QuizPromptInput {
  city: string
  country: string
  difficulty: Difficulty
  duration_target_min: number
  nb_etapes: number
  theme_preference?: string
}

export function buildQuizPrompt(input: QuizPromptInput): string {
  const lines = [
    'Contexte de la balade à venir :',
    `- Ville : ${input.city}`,
    `- Pays : ${input.country}`,
    `- Difficulté : ${input.difficulty}`,
    `- Durée cible : ${input.duration_target_min} minutes`,
    `- Nombre d'étapes : ${input.nb_etapes}`,
  ]
  if (input.theme_preference?.trim()) {
    lines.push(`- Préférence de thème : ${input.theme_preference.trim()}`)
  }
  lines.push('')
  lines.push(
    'Génère 4 à 6 questions à choix multiple qui aideront à mieux orienter la balade. Adapte les options à cette ville et cette durée.',
  )
  return lines.join('\n')
}

interface ParsedQuiz {
  questions: QuizQuestion[]
}

function extractJson(text: string): unknown {
  let raw = text.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  }
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first === -1 || last === -1) return null
  try {
    return JSON.parse(raw.slice(first, last + 1))
  } catch {
    return null
  }
}

const asString = (v: unknown): string => (typeof v === 'string' ? v : '')

export function parseQuiz(text: string): ParsedQuiz | null {
  const parsed = extractJson(text) as { questions?: unknown } | null
  if (!parsed || !Array.isArray(parsed.questions)) return null
  const questions: QuizQuestion[] = []
  for (const q of parsed.questions) {
    if (!q || typeof q !== 'object') continue
    const obj = q as Record<string, unknown>
    const id = asString(obj.id).trim() || `q${questions.length + 1}`
    const label = asString(obj.label).trim()
    if (!label) continue
    const rawOptions = Array.isArray(obj.options) ? obj.options : []
    const options = rawOptions
      .map((opt, i) => {
        if (!opt || typeof opt !== 'object') return null
        const o = opt as Record<string, unknown>
        const oid = asString(o.id).trim() || `${id}-${i + 1}`
        const olabel = asString(o.label).trim()
        return olabel ? { id: oid, label: olabel } : null
      })
      .filter((x): x is { id: string; label: string } => x !== null)
    if (options.length >= 2) {
      questions.push({ id, label, options })
    }
  }
  if (questions.length < 2) return null
  return { questions: questions.slice(0, 6) }
}
