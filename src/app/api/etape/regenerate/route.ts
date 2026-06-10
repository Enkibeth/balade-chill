import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserSettings } from '@/lib/supabase/queries'
import { generateBaladeText } from '@/lib/ai/providers'
import { validateAndFixEnigme } from '@/lib/llm/cipherCheck'
import { geocodeAddress, shortenDisplayName } from '@/lib/llm/geocode'
import type { GeneratedEnigme } from '@/lib/llm/generated'
import type {
  AIProvider,
  Difficulty,
  Enigme,
  EnigmeType,
  MedicalBonus,
  MedicalSpecialty,
} from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

const DIFFICULTIES: Difficulty[] = ['facile', 'moyen', 'difficile', 'boss']
const ENIGME_TYPES: EnigmeType[] = [
  'cipher_reverse', 'cipher_caesar', 'math_code', 'polybe', 'wordplay',
  'anagram', 'morse', 'a1z26', 'vigenere', 'charade', 'rebus', 'acrostiche',
  'riddle',
]
const SPECIALTIES: MedicalSpecialty[] = [
  'cardiologie', 'neurologie', 'pneumologie', 'gastro', 'urgences',
]

const asString = (v: unknown, fb = ''): string =>
  typeof v === 'string' ? v : fb
const asNumber = (v: unknown, fb = 0): number => {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fb
}

interface Neighbour {
  location_name: string
  lat: number
  lng: number
}

function parseNeighbour(v: unknown): Neighbour | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const lat = asNumber(o.lat, NaN)
  const lng = asNumber(o.lng, NaN)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null
  return { location_name: asString(o.location_name), lat, lng }
}

const SYSTEM_PROMPT = `Tu es le maître du jeu d'une application de balades romantiques à énigmes pour un couple (Hugo et Éloïse, étudiants en médecine D5). On te demande de REGÉNÉRER UNE SEULE étape d'un parcours existant, parce que le lieu d'origine était trop éloigné des étapes voisines.

## TA RÉPONSE
Réponds UNIQUEMENT avec un objet JSON valide (premier caractère "{", dernier "}"). Aucun texte autour, aucun markdown.

## FORMAT
{
  "location_name": string,        // un lieu RÉEL et identifiable, proche des voisins
  "lat": number,                  // latitude GPS réelle
  "lng": number,                  // longitude GPS réelle
  "story_text": string,           // court fragment de récit pour cette étape (1 paragraphe)
  "direction_text": string,       // comment rejoindre l'étape suivante
  "action_mission": string,       // petite mission complice sur place
  "enigme": {
    "type": string,               // EXACTEMENT le type imposé ci-dessous
    "title": string,
    "instruction": string,
    "cipher_display": string,     // texte chiffré/codé ou énoncé du jeu
    "hint": string,
    "answer": string,
    "answer_explanation": string
  },
  "medical_bonus": {              // null si non demandé
    "specialty": string,
    "question": string,
    "hint": string,
    "answer": string
  }
}

## RÈGLES IMPÉRATIVES
- Le NOUVEAU lieu doit être RÉEL et SITUÉ À QUELQUES MINUTES DE MARCHE (idéalement < 1 km) des deux étapes voisines fournies. C'est le but : rapprocher cette étape.
- Coordonnées GPS exactes (elles seront re-vérifiées). Ne réutilise pas le lieu à éviter.
- Respecte EXACTEMENT le type d'énigme imposé. Pour tout chiffrement, "cipher_display" doit réellement encoder "answer".
- Question médicale (si demandée) de niveau D5, exigeante, avec le raisonnement clinique complet dans "answer".
- Ton romantique, complice, élégant, années 1920. Français.`

function buildPrompt(input: {
  city: string
  country: string
  difficulty: Difficulty
  order: number
  enigmeType: EnigmeType
  prev: Neighbour | null
  next: Neighbour | null
  avoid: string
  wantsMedical: boolean
  specialties: string[]
}): string {
  const lines = [
    `Ville : ${input.city} (${input.country}).`,
    `Étape à regénérer : numéro ${input.order}.`,
    `Type d'énigme imposé (à respecter strictement) : "${input.enigmeType}".`,
  ]
  if (input.avoid) {
    lines.push(`Lieu à éviter (trop loin) : "${input.avoid}".`)
  }
  if (input.prev) {
    lines.push(
      `Étape PRÉCÉDENTE : "${input.prev.location_name}" (lat=${input.prev.lat}, lng=${input.prev.lng}).`,
    )
  }
  if (input.next) {
    lines.push(
      `Étape SUIVANTE : "${input.next.location_name}" (lat=${input.next.lat}, lng=${input.next.lng}).`,
    )
  }
  const anchor = input.prev ?? input.next
  if (anchor) {
    lines.push(
      `Le nouveau lieu doit être à quelques minutes de marche (idéalement < 1 km) de ${
        input.prev && input.next ? 'CES DEUX lieux' : 'ce lieu'
      }.`,
    )
  }
  lines.push(
    input.wantsMedical
      ? `Inclure une question médicale D5 (spécialités à privilégier : ${
          input.specialties.join(', ') || 'cardiologie, neurologie'
        }).`
      : 'Mets "medical_bonus" à null.',
  )
  lines.push('Réponds uniquement avec le JSON de cette étape.')
  return lines.join('\n')
}

function extractJson(text: string): Record<string, unknown> | null {
  let raw = text.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  }
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first === -1 || last === -1) return null
  try {
    return JSON.parse(raw.slice(first, last + 1)) as Record<string, unknown>
  } catch {
    return null
  }
}

export async function POST(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }
  const b = (body ?? {}) as Record<string, unknown>
  const city = asString(b.city).trim()
  const country = asString(b.country).trim()
  const difficulty = b.difficulty as Difficulty
  const order = asNumber(b.order, NaN)
  if (!city || !DIFFICULTIES.includes(difficulty) || !Number.isFinite(order)) {
    return NextResponse.json({ error: 'Paramètres invalides' }, { status: 400 })
  }
  const enigmeType: EnigmeType = ENIGME_TYPES.includes(
    b.enigme_type as EnigmeType,
  )
    ? (b.enigme_type as EnigmeType)
    : 'wordplay'
  const prev = parseNeighbour(b.prev)
  const next = parseNeighbour(b.next)
  const avoid = asString(b.avoid).trim()
  const wantsMedical = Boolean(b.wants_medical)
  const specialties = Array.isArray(b.specialties)
    ? (b.specialties.filter((s) => typeof s === 'string') as string[])
    : []

  // Reuse the user's draft model/key.
  const settings = await getUserSettings(supabase, user.id)
  const provider: AIProvider = settings?.ai_provider ?? 'anthropic'
  const model =
    settings?.ai_model && settings.ai_model.length > 0
      ? settings.ai_model
      : 'claude-sonnet-4-6'
  const apiKey =
    settings?.ai_api_key && settings.ai_api_key.length > 0
      ? settings.ai_api_key
      : undefined
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Aucune clé API personnelle configurée.' },
      { status: 400 },
    )
  }

  let parsed: Record<string, unknown> | null
  try {
    const output = await generateBaladeText(
      {
        provider,
        apiKey,
        model,
        difficulty,
        generationId: crypto.randomUUID(),
        maxTokensOverride: 1300,
      },
      SYSTEM_PROMPT,
      buildPrompt({
        city,
        country,
        difficulty,
        order,
        enigmeType,
        prev,
        next,
        avoid,
        wantsMedical,
        specialties,
      }),
    )
    parsed = extractJson(output.text)
  } catch (err) {
    console.error('Étape regeneration failed:', err)
    return NextResponse.json(
      { error: 'Impossible de régénérer cette étape.' },
      { status: 502 },
    )
  }
  if (!parsed) {
    return NextResponse.json(
      { error: 'Réponse illisible du modèle.' },
      { status: 502 },
    )
  }

  const locationName = asString(parsed.location_name, `Étape ${order}`)

  // Trust real geocoding over the model's coordinates: re-geocode the returned
  // place name so we never persist a hallucinated lat/lng.
  const geocoded = await geocodeAddress(
    [locationName, city, country].filter(Boolean).join(', '),
  )
  const lat = geocoded?.lat ?? asNumber(parsed.lat)
  const lng = geocoded?.lng ?? asNumber(parsed.lng)
  const finalName = geocoded
    ? shortenDisplayName(geocoded.displayName)
    : locationName

  const rawEnigme = (parsed.enigme ?? {}) as Record<string, unknown>
  const candidate: GeneratedEnigme = {
    type: ENIGME_TYPES.includes(rawEnigme.type as EnigmeType)
      ? (rawEnigme.type as EnigmeType)
      : enigmeType,
    title: asString(rawEnigme.title, 'Énigme'),
    instruction: asString(rawEnigme.instruction),
    cipher_display: asString(rawEnigme.cipher_display),
    hint: asString(rawEnigme.hint),
    answer: asString(rawEnigme.answer),
    answer_explanation: asString(rawEnigme.answer_explanation),
  }
  const { enigme: fixedEnigme } = validateAndFixEnigme(candidate)

  const enigme: Enigme = {
    id: crypto.randomUUID(),
    type: (fixedEnigme.type as EnigmeType) ?? enigmeType,
    title: fixedEnigme.title,
    instruction: fixedEnigme.instruction,
    cipher_display: fixedEnigme.cipher_display ?? '',
    hint: fixedEnigme.hint,
    answer: fixedEnigme.answer,
    answer_explanation: fixedEnigme.answer_explanation,
    difficulty,
  }

  let medical: MedicalBonus | null = null
  const rawMed = parsed.medical_bonus
  if (wantsMedical && rawMed && typeof rawMed === 'object') {
    const m = rawMed as Record<string, unknown>
    const spec = SPECIALTIES.includes(m.specialty as MedicalSpecialty)
      ? (m.specialty as MedicalSpecialty)
      : 'cardiologie'
    medical = {
      id: crypto.randomUUID(),
      specialty: spec,
      question: asString(m.question),
      hint: asString(m.hint),
      answer: asString(m.answer),
      year_level: 5,
    }
  }

  return NextResponse.json({
    etape: {
      location_name: finalName,
      lat,
      lng,
      maps_url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      story_text: asString(parsed.story_text),
      direction_text: asString(parsed.direction_text),
      action_mission: asString(parsed.action_mission),
      enigme,
      medical_bonus: medical,
    },
    geocoded: Boolean(geocoded),
  })
}
