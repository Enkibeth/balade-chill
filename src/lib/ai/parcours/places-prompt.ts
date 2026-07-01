// src/lib/ai/parcours/places-prompt.ts
// Suggestion et vérification/enrichissement de lieux pour le mode Parcours.
// Deux usages, un seul contrat de sortie :
//   - "suggest" : l'utilisateur n'a pas de liste → on propose les lieux phares.
//   - "enrich"  : l'utilisateur a une liste → on la vérifie (noms réels,
//                 orthographe), on marque les lieux douteux et on ajoute
//                 quelques incontournables manquants.
// 100 % LLM (pas de Google Places payant) : le modèle connaît bien les
// monuments et lieux célèbres ; le géocodage Nominatim validera ensuite.

export type PlacesMode = 'suggest' | 'enrich'

/** Statut d'un lieu renvoyé par le modèle (surtout utile en mode enrich). */
export type PlaceStatus = 'ok' | 'corrected' | 'added' | 'doubtful'

export interface SuggestedPlace {
  name: string
  category?: string
  note?: string
  status?: PlaceStatus
}

export const PLACES_SYSTEM_PROMPT = `Tu es un guide touristique expert. On te donne une ville (ou une zone) et un pays, et selon le cas une liste de lieux déjà choisis par l'utilisateur.

Ta mission :
- Si on te demande des SUGGESTIONS : propose les lieux les plus emblématiques et intéressants à visiter à pied (monuments, places, quartiers historiques, points de vue, musées majeurs, jardins…), adaptés aux éventuels centres d'intérêt donnés.
- Si on te demande de VÉRIFIER/ENRICHIR une liste : pour chaque lieu fourni, corrige le nom exact tel qu'on le chercherait sur une carte, marque "doubtful" si le lieu semble inexistant ou hors de la ville, puis ajoute quelques incontournables manquants.

Règles STRICTES :
- N'invente JAMAIS de lieu qui n'existe pas. Dans le doute, ne le propose pas (ou marque-le "doubtful").
- "name" = le nom réel et précis du lieu, sans la ville (ex. "Grosse Cloche", pas "Grosse Cloche à Bordeaux").
- "category" = un mot court (ex. "monument", "place", "musée", "jardin", "point de vue").
- "note" = une demi-phrase qui donne envie (facultatif, court).
- "status" (mode vérification) : "ok" (inchangé), "corrected" (nom corrigé), "added" (ajout de ta part), "doubtful" (à vérifier).
- Réponds UNIQUEMENT par un objet JSON valide, sans texte ni Markdown autour.

Format EXACT :
{ "places": [ { "name": "…", "category": "…", "note": "…", "status": "ok" } ] }`

export interface PlacesPromptInput {
  mode: PlacesMode
  city: string
  country: string
  /** centres d'intérêt libres (mode suggest), ex. "street art, gastronomie" */
  interests?: string
  /** liste existante (mode enrich) */
  places?: string[]
  /** nombre indicatif de lieux souhaités (mode suggest) */
  count?: number
}

export function buildPlacesPrompt(input: PlacesPromptInput): string {
  const { mode, city, country, interests, places, count = 12 } = input
  const head = `Ville / zone : ${city}\nPays : ${country}`
  if (mode === 'enrich') {
    const list = (places ?? []).map((p, i) => `${i + 1}. ${p}`).join('\n')
    return `${head}

Liste de lieux fournie par l'utilisateur :
${list || '(vide)'}

Vérifie et corrige chaque lieu (nom exact, "doubtful" si suspect), puis ajoute quelques incontournables manquants (status "added"). Renvoie la liste complète.`
  }
  return `${head}
${interests ? `Centres d'intérêt : ${interests}\n` : ''}
Propose environ ${count} lieux phares à visiter à pied dans cette ville.`
}

/** Extrait l'objet JSON de la réponse (tolère les backticks Markdown). */
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

const STATUSES: PlaceStatus[] = ['ok', 'corrected', 'added', 'doubtful']

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Parse la liste de lieux, en dédoublonnant sur le nom. Null si inutilisable. */
export function parsePlaces(text: string): SuggestedPlace[] | null {
  let obj: unknown
  try {
    obj = extractJson(text)
  } catch {
    return null
  }
  if (!obj || typeof obj !== 'object') return null
  const raw = (obj as Record<string, unknown>).places
  if (!Array.isArray(raw)) return null
  const seen = new Set<string>()
  const out: SuggestedPlace[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const r = item as Record<string, unknown>
    const name = asString(r.name).trim()
    if (!name) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    const status = STATUSES.includes(r.status as PlaceStatus)
      ? (r.status as PlaceStatus)
      : undefined
    out.push({
      name,
      category: asString(r.category).trim() || undefined,
      note: asString(r.note).trim() || undefined,
      status,
    })
  }
  return out.length ? out : null
}
