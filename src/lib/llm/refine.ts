import type { Difficulty, RefineConfig, RefineTarget } from '@/types'
import type { GeneratedBalade } from './generated'

export function shouldRefine(
  refine: RefineConfig | undefined,
  difficulty: Difficulty,
): refine is RefineConfig {
  return Boolean(
    refine?.enabled &&
      refine.apiKey &&
      refine.targets.length > 0 &&
      refine.difficulties.includes(difficulty),
  )
}

/** Output budget for the refine pass: small, since it only emits corrections. */
export function refineMaxTokens(nbEtapes: number): number {
  return Math.min(12000, Math.max(3000, 1500 + nbEtapes * 1400))
}

export const REFINE_SYSTEM_PROMPT = `Tu es un relecteur expert pour une application de balades à énigmes ("Balades"). On te donne le BROUILLON d'une balade produit par un modèle rapide. Ton rôle : repérer et corriger UNIQUEMENT les défauts réels, sans tout réécrire.

## TA RÉPONSE
Réponds UNIQUEMENT avec un objet JSON valide (premier caractère "{", dernier "}"). Aucun texte autour, aucun bloc markdown.

## FORMAT DE SORTIE
{
  "fixes": [
    {
      "order": number,                 // numéro de l'étape corrigée
      "enigme": {                      // n'inclure que si une énigme est fausse
        "cipher_display": string,      // texte chiffré corrigé
        "answer": string,              // réponse exacte
        "answer_explanation": string,  // décodage pas à pas correct
        "instruction": string          // optionnel
      },
      "location_name": string,         // n'inclure que si le lieu est incohérent
      "direction_text": string,
      "lat": number,
      "lng": number
    }
  ],
  "story_context": string,             // optionnel, prose globale
  "prologue": string,                  // optionnel, prose globale
  "epilogue": string                   // optionnel, prose globale
}

## RÈGLES
- N'inclus dans "fixes" QUE les étapes qui ont un vrai problème. Si tout est correct, renvoie {"fixes": []}.
- Pour chaque étape, n'inclus QUE les champs que tu modifies. Ne recopie jamais un champ inchangé.
- Ne change jamais le "order" ni le nombre d'étapes.
- La prose à réécrire (si demandée) est UNIQUEMENT story_context/prologue/epilogue. Ne réécris JAMAIS les "story_text" ou "action_mission" par étape — ils restent ceux du brouillon.`

interface RefinePromptInput {
  draft: GeneratedBalade
  targets: RefineTarget[]
  city: string
  country: string
  difficulty: Difficulty
}

const DIFFICULTY_RULES: Record<Difficulty, string> = {
  facile: 'uniquement "wordplay" (aucun chiffrement)',
  moyen: '"cipher_caesar" ou "math_code"',
  difficile: '"polybe" ou "cipher_reverse"',
  boss: 'énigmes multi-étapes combinant plusieurs chiffrements',
}

export function buildRefinePrompt(input: RefinePromptInput): string {
  const { draft, targets, city, country, difficulty } = input
  const has = (t: RefineTarget) => targets.includes(t)

  const etapes = [...draft.etapes].sort((a, b) => a.order - b.order)
  const etapeBlocks = etapes.map((e) => {
    const parts: Record<string, unknown> = { order: e.order }
    if (has('enigmes')) {
      parts.enigme = {
        type: e.enigme?.type,
        instruction: e.enigme?.instruction,
        cipher_display: e.enigme?.cipher_display ?? '',
        answer: e.enigme?.answer,
        answer_explanation: e.enigme?.answer_explanation,
      }
    }
    if (has('coherence')) {
      parts.location_name = e.location_name
      parts.lat = e.lat
      parts.lng = e.lng
      parts.direction_text = e.direction_text
    }
    return parts
  })

  const checks: string[] = []
  if (has('enigmes')) {
    checks.push(
      `- ÉNIGMES : pour chaque étape, décode "cipher_display" et vérifie que cela donne EXACTEMENT "answer". Corrige "cipher_display"/"answer"/"answer_explanation" si le décodage ne correspond pas. Le type d'énigme doit respecter la difficulté "${difficulty}" : ${DIFFICULTY_RULES[difficulty]}.`,
    )
  }
  if (has('coherence')) {
    checks.push(
      `- COHÉRENCE : vérifie que les lieux existent vraiment à ${city} (${country}), que les coordonnées GPS sont plausibles, et que l'ordre des étapes forme un itinéraire marchable. Corrige lat/lng/location_name/direction_text si nécessaire.`,
    )
  }
  if (has('prose')) {
    checks.push(
      `- PROSE (uniquement story_context, prologue, epilogue) : récris ces textes globaux dans un style roman policier romantique années 1920 si le brouillon est plat ou hors-ton. Ne touche pas aux textes par étape.`,
    )
  }

  return [
    `Balade à relire — Ville : ${city} (${country}) — Difficulté : ${difficulty}.`,
    '',
    'Contrôles à effectuer :',
    ...checks,
    '',
    'BROUILLON (étapes) :',
    JSON.stringify(etapeBlocks),
    has('prose')
      ? `\nProse globale actuelle :\n${JSON.stringify({
          story_context: draft.story_context,
          prologue: draft.prologue,
          epilogue: draft.epilogue,
        })}`
      : '',
    '',
    'Renvoie le JSON de corrections (uniquement les défauts réels).',
  ].join('\n')
}

interface RefinePatch {
  fixes?: Array<Record<string, unknown>>
  story_context?: unknown
  prologue?: unknown
  epilogue?: unknown
}

function extractPatch(text: string): RefinePatch | null {
  let raw = text.trim()
  if (!raw) return null
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  }
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first === -1 || last === -1) return null
  try {
    return JSON.parse(raw.slice(first, last + 1)) as RefinePatch
  } catch {
    return null
  }
}

const str = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v : null
const num = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? v : null

/**
 * Merges the refine model's corrections into the draft, applying only the
 * fields permitted by the enabled targets. Returns a new balade; never throws.
 */
export function applyRefinePatch(
  draft: GeneratedBalade,
  patchText: string,
  targets: RefineTarget[],
): { balade: GeneratedBalade; appliedFixes: number } {
  const patch = extractPatch(patchText)
  if (!patch) return { balade: draft, appliedFixes: 0 }
  const has = (t: RefineTarget) => targets.includes(t)

  const merged: GeneratedBalade = {
    ...draft,
    etapes: draft.etapes.map((e) => ({ ...e, enigme: { ...e.enigme } })),
  }

  if (has('prose')) {
    const sc = str(patch.story_context)
    const pro = str(patch.prologue)
    const epi = str(patch.epilogue)
    if (sc) merged.story_context = sc
    if (pro) merged.prologue = pro
    if (epi) merged.epilogue = epi
  }

  let applied = 0
  const fixes = Array.isArray(patch.fixes) ? patch.fixes : []
  for (const fix of fixes) {
    const order = num(fix.order)
    if (order === null) continue
    const etape = merged.etapes.find((e) => e.order === order)
    if (!etape) continue
    let touched = false

    if (has('enigmes') && fix.enigme && typeof fix.enigme === 'object') {
      const en = fix.enigme as Record<string, unknown>
      for (const key of [
        'cipher_display',
        'answer',
        'answer_explanation',
        'instruction',
      ] as const) {
        const val = str(en[key])
        if (val) {
          etape.enigme[key] = val
          touched = true
        }
      }
    }

    if (has('coherence')) {
      const loc = str(fix.location_name)
      const dir = str(fix.direction_text)
      const lat = num(fix.lat)
      const lng = num(fix.lng)
      if (loc) {
        etape.location_name = loc
        touched = true
      }
      if (dir) {
        etape.direction_text = dir
        touched = true
      }
      if (lat !== null) {
        etape.lat = lat
        touched = true
      }
      if (lng !== null) {
        etape.lng = lng
        touched = true
      }
    }

    if (touched) applied += 1
  }

  return { balade: merged, appliedFixes: applied }
}
