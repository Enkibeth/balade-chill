import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserSettings } from '@/lib/supabase/queries'
import { generateBaladeText } from '@/lib/ai/providers'
import { validateAndFixEnigme } from '@/lib/ai/cipherCheck'
import { geocodeAddress, shortenDisplayName } from '@/lib/ai/geocode'
import { bonusCategoryDef, isBonusCategory } from '@/lib/ai/bonus'
import type { GeneratedEnigme } from '@/lib/ai/generated'
import type {
  AIProvider,
  BonusCategory,
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

// The three ways a single étape can be regenerated from the validation screen.
//  - 'closer' : the original behaviour — find a real place near the neighbours
//               because the current one is too far to walk to.
//  - 'prompt' : a full AI rewrite steered by a free-text instruction from the
//               user (e.g. "make it about a hidden bookshop, easier enigma").
//  - 'place'  : the user pinned an exact point + place name on the map; we keep
//               those coordinates and only (re)write a coherent story, mission
//               and énigme anchored to that precise place.
type RegenMode = 'closer' | 'prompt' | 'place'
const REGEN_MODES: RegenMode[] = ['closer', 'prompt', 'place']

const SYSTEM_PROMPT = `Tu es le maître du jeu d'une application de balades romantiques à énigmes pour un couple (Hugo et Éloïse, étudiants en médecine D5). On te demande de REGÉNÉRER UNE SEULE étape d'un parcours existant. Le message ci-dessous précise POURQUOI (rapprocher l'étape, la retravailler selon une demande, ou l'ancrer sur un lieu imposé) — suis cette consigne à la lettre.

## TA RÉPONSE
Réponds UNIQUEMENT avec un objet JSON valide (premier caractère "{", dernier "}"). Aucun texte autour, aucun markdown.

## FORMAT
{
  "location_name": string,        // un lieu RÉEL et identifiable
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
    "category": string,           // le thème imposé ci-dessous
    "label": string,              // étiquette courte affichée
    "specialty": string,          // uniquement si category = "medical"
    "question": string,
    "hint": string,
    "answer": string
  }
}

## RÈGLES IMPÉRATIVES
- Coordonnées GPS exactes (elles seront re-vérifiées). Le récit, la mission et l'énigme doivent parler du lieu de cette étape : nom du lieu, coordonnées et histoire désignent le MÊME endroit.
- Respecte EXACTEMENT le type d'énigme imposé. Pour tout chiffrement, "cipher_display" doit réellement encoder "answer".
- Question médicale (si demandée) de niveau D5, exigeante, avec le raisonnement clinique complet dans "answer".
- Ton romantique, complice, élégant, années 1920. Français.`

function buildPrompt(input: {
  city: string
  country: string
  difficulty: Difficulty
  order: number
  enigmeType: EnigmeType
  mode: RegenMode
  userPrompt: string
  placed: Neighbour | null
  prev: Neighbour | null
  next: Neighbour | null
  avoid: string
  wantsMedical: boolean
  specialties: string[]
  bonusCategory: BonusCategory
  bonusCustomTheme: string
}): string {
  const lines = [
    `Ville : ${input.city} (${input.country}).`,
    `Étape à regénérer : numéro ${input.order}.`,
    `Type d'énigme imposé (à respecter strictement) : "${input.enigmeType}".`,
  ]

  // Mode-specific objective. Stated up front, then reinforced where it matters.
  if (input.mode === 'place') {
    lines.push(
      '',
      '⚠️ LIEU IMPOSÉ PAR LE JOUEUR — NE LE CHANGE PAS :',
      `  • "location_name" = « ${input.placed?.location_name ?? ''} » (lat=${input.placed?.lat}, lng=${input.placed?.lng}).`,
      '  • Reprends ce nom et ces coordonnées TELS QUELS. N\'invente aucun autre lieu.',
      '  • Écris un récit, une mission complice et une énigme COHÉRENTS avec ce lieu précis (son ambiance, son histoire, ce qu\'on y voit).',
    )
  } else if (input.mode === 'prompt') {
    lines.push(
      '',
      '⚠️ DEMANDE DU JOUEUR — À RESPECTER IMPÉRATIVEMENT :',
      `  « ${input.userPrompt} »`,
      '  • Retravaille cette étape (lieu, récit, mission et/ou énigme) pour répondre PRÉCISÉMENT à cette demande.',
      '  • Si la demande nomme un lieu, ancre l\'étape sur ce lieu réel (coordonnées exactes).',
    )
  } else if (input.avoid) {
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
  // Proximity matters when the model picks the location itself ('closer' and
  // 'prompt'). In 'place' mode the user fixed the point, so we don't constrain.
  const anchor = input.prev ?? input.next
  if (anchor && input.mode !== 'place') {
    const proximity =
      input.mode === 'closer'
        ? `Le nouveau lieu doit être à quelques minutes de marche (idéalement < 1 km) de ${
            input.prev && input.next ? 'CES DEUX lieux' : 'ce lieu'
          }. C'est le but : rapprocher cette étape.`
        : `Garde le lieu à distance de marche raisonnable (idéalement < 1 km) de ${
            input.prev && input.next ? 'ces deux étapes voisines' : 'l\'étape voisine'
          } pour rester marchable.`
    lines.push(proximity)
  }
  if (!input.wantsMedical) {
    lines.push('Mets "medical_bonus" à null.')
  } else {
    const def = bonusCategoryDef(input.bonusCategory)
    let guidance = def.guidance
    if (input.bonusCategory === 'medical') {
      guidance += ` Spécialités à privilégier : ${
        input.specialties.join(', ') || 'cardiologie, neurologie'
      }.`
    }
    if (input.bonusCategory === 'custom' && input.bonusCustomTheme) {
      guidance += ` Thème personnalisé : « ${input.bonusCustomTheme} ».`
    }
    lines.push(
      `Question bonus — thème imposé "category": "${input.bonusCategory}". ${guidance}`,
    )
  }
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
  const mode: RegenMode = REGEN_MODES.includes(b.mode as RegenMode)
    ? (b.mode as RegenMode)
    : 'closer'
  const userPrompt = asString(b.user_prompt).trim()
  const placed = parseNeighbour(b.placed)
  if (mode === 'prompt' && !userPrompt) {
    return NextResponse.json(
      { error: 'Décris la modification souhaitée.' },
      { status: 400 },
    )
  }
  if (mode === 'place' && (!placed || !placed.location_name.trim())) {
    return NextResponse.json(
      { error: 'Place un lieu sur la carte avant de générer.' },
      { status: 400 },
    )
  }
  const prev = parseNeighbour(b.prev)
  const next = parseNeighbour(b.next)
  const avoid = asString(b.avoid).trim()
  const wantsMedical = Boolean(b.wants_medical)
  const specialties = Array.isArray(b.specialties)
    ? (b.specialties.filter((s) => typeof s === 'string') as string[])
    : []
  const bonusCategory: BonusCategory = isBonusCategory(b.bonus_category)
    ? b.bonus_category
    : 'medical'
  const bonusCustomTheme = asString(b.bonus_custom_theme).trim()
  const bonusLabel = asString(b.bonus_label).trim()

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
        mode,
        userPrompt,
        placed,
        prev,
        next,
        avoid,
        wantsMedical,
        specialties,
        bonusCategory,
        bonusCustomTheme,
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

  // In 'place' mode the user pinned an exact point: trust it over anything the
  // model returns. Otherwise re-geocode the returned place name so we never
  // persist a hallucinated lat/lng.
  let lat: number
  let lng: number
  let finalName: string
  let geocoded = false
  if (mode === 'place' && placed) {
    lat = placed.lat
    lng = placed.lng
    finalName = placed.location_name
    geocoded = true
  } else {
    // Disambiguate the place name with the model's own coordinate (and the
    // neighbours as a fallback anchor) so a generic name snaps to the intended
    // spot rather than a same-named place elsewhere.
    const modelLat = asNumber(parsed.lat, NaN)
    const modelLng = asNumber(parsed.lng, NaN)
    const anchor =
      Number.isFinite(modelLat) && Number.isFinite(modelLng)
        ? { lat: modelLat, lng: modelLng }
        : prev ?? next
    const place = await geocodeAddress(
      [locationName, city, country].filter(Boolean).join(', '),
      anchor ? { near: { lat: anchor.lat, lng: anchor.lng }, limit: 5 } : {},
    )
    lat = place?.lat ?? asNumber(parsed.lat)
    lng = place?.lng ?? asNumber(parsed.lng)
    finalName = place ? shortenDisplayName(place.displayName) : locationName
    geocoded = Boolean(place)
  }

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
    const label = bonusLabel || asString(m.label).trim()
    if (bonusCategory === 'medical') {
      const spec = SPECIALTIES.includes(m.specialty as MedicalSpecialty)
        ? (m.specialty as MedicalSpecialty)
        : 'cardiologie'
      medical = {
        id: crypto.randomUUID(),
        category: 'medical',
        label: label || spec,
        specialty: spec,
        question: asString(m.question),
        hint: asString(m.hint),
        answer: asString(m.answer),
        year_level: 5,
      }
    } else {
      medical = {
        id: crypto.randomUUID(),
        category: bonusCategory,
        label: label || bonusCategoryDef(bonusCategory).defaultBadge,
        question: asString(m.question),
        hint: asString(m.hint),
        answer: asString(m.answer),
      }
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
    geocoded,
  })
}
