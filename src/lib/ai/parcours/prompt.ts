// src/lib/ai/parcours/prompt.ts
// Prompt + parsing du mode « Parcours ». Le modèle ne s'occupe QUE du texte :
// à partir de la liste ordonnée des lieux (déjà géocodés et ordonnés par le
// moteur d'itinéraires), il écrit un titre, une intro, puis pour chaque arrêt
// une anecdote et une petite question de culture avec sa réponse. Aucune
// coordonnée, aucune énigme chiffrée.

import type { ParcoursLLMOutput } from './types'

export const PARCOURS_SYSTEM_PROMPT = `Tu es un guide touristique cultivé et chaleureux. On te donne une ville, un pays et une liste ORDONNÉE de lieux à visiter. Tu produis le contenu d'un parcours de visite à pied, en français.

Pour CHAQUE lieu, dans l'ordre exact fourni, tu écris :
- "anecdote" : 2 à 4 phrases vivantes et précises (histoire, détail architectural, personnage, événement marquant). Pas de généralités creuses.
- "question" : une petite question de culture ludique liée au lieu (une seule phrase). Niveau grand public, pas une énigme, pas de chiffrement.
- "answer" : la réponse claire à la question (une ou deux phrases).

Tu écris aussi :
- "title" : un titre court et évocateur pour le parcours.
- "intro" : 2 à 3 phrases qui présentent la balade et donnent envie.

Règles STRICTES :
- Renvoie les lieux dans le MÊME ordre et avec le champ "name" IDENTIQUE à celui fourni.
- N'invente pas de lieux, n'en ajoute pas, n'en retire pas.
- Reste factuel : si tu n'es pas sûr d'un détail, choisis un fait sûr et général plutôt qu'une affirmation risquée.
- Réponds UNIQUEMENT par un objet JSON valide, sans texte autour, sans balises Markdown.

Format de sortie EXACT :
{
  "title": "…",
  "intro": "…",
  "stops": [
    { "name": "…", "anecdote": "…", "question": "…", "answer": "…" }
  ]
}`

export interface ParcoursPromptInput {
  city: string
  country: string
  duration_target_min: number
  /** noms des arrêts DANS L'ORDRE FINAL du parcours */
  orderedStopNames: string[]
}

export function buildParcoursPrompt(input: ParcoursPromptInput): string {
  const { city, country, duration_target_min, orderedStopNames } = input
  const list = orderedStopNames.map((n, i) => `${i + 1}. ${n}`).join('\n')
  return `Ville : ${city}
Pays : ${country}
Durée souhaitée : environ ${duration_target_min} minutes

Lieux à visiter, DANS CET ORDRE (garde exactement ces noms) :
${list}

Rédige le parcours pour ces ${orderedStopNames.length} lieux en respectant scrupuleusement l'ordre et les noms.`
}

/** Extrait l'objet JSON de la réponse du modèle (tolère les backticks). */
function extractJson(text: string): unknown {
  let raw = text.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  }
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('no JSON object found')
  return JSON.parse(raw.slice(first, last + 1))
}

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/**
 * Parse et valide la sortie du modèle. Renvoie null si la structure est
 * inutilisable (ni titre, ni arrêts).
 */
export function parseParcours(text: string): ParcoursLLMOutput | null {
  let obj: unknown
  try {
    obj = extractJson(text)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const rawStops = Array.isArray(o.stops) ? o.stops : []
  const stops = rawStops
    .map((s) => {
      if (!s || typeof s !== 'object') return null
      const r = s as Record<string, unknown>
      const name = asString(r.name).trim()
      if (!name) return null
      return {
        name,
        anecdote: asString(r.anecdote).trim(),
        question: asString(r.question).trim(),
        answer: asString(r.answer).trim(),
      }
    })
    .filter((s): s is ParcoursLLMOutput['stops'][number] => s !== null)
  if (stops.length === 0) return null
  return {
    title: asString(o.title).trim() || 'Parcours de visite',
    intro: asString(o.intro).trim(),
    stops,
  }
}
