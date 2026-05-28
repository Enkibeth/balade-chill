import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getUserSettings,
  saveGeneratedBalade,
} from '@/lib/supabase/queries'
import {
  GENERATION_SYSTEM_PROMPT,
  buildGenerationPrompt,
} from '@/lib/claude/generation-prompt'
import { renderBaladeHtml } from '@/lib/claude/render-html'
import { generateBaladeText } from '@/lib/ai/providers'
import type {
  AIProvider,
  Balade,
  Difficulty,
  Enigme,
  EnigmeType,
  Etape,
  GenerationRequest,
  MedicalBonus,
  MedicalSpecialty,
  ThemeColor,
} from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

const DIFFICULTIES: Difficulty[] = ['facile', 'moyen', 'difficile', 'boss']
const ENIGME_TYPES: EnigmeType[] = [
  'cipher_reverse',
  'cipher_caesar',
  'math_code',
  'polybe',
  'wordplay',
  'anagram',
]
const SPECIALTIES: MedicalSpecialty[] = [
  'cardiologie',
  'neurologie',
  'pneumologie',
  'gastro',
  'urgences',
]

/** Shape of the JSON the model is asked to return. */
interface GeneratedBalade {
  title: string
  theme_color: Partial<ThemeColor>
  estimated_duration_min: number
  distance_km: number
  story_context: string
  prologue: string
  epilogue: string
  route_makes_sense: boolean
  etapes: GeneratedEtape[]
}
interface GeneratedEtape {
  order: number
  location_name: string
  lat: number
  lng: number
  story_text: string
  direction_text: string
  walk_minutes: number
  action_mission: string
  enigme: {
    type: string
    title: string
    instruction: string
    cipher_display?: string
    hint: string
    answer: string
    answer_explanation: string
  }
  medical_bonus: {
    specialty: string
    question: string
    hint?: string
    answer: string
  } | null
}

function asString(v: unknown, fallback = ''): string {
  return typeof v === 'string' ? v : fallback
}
function asNumber(v: unknown, fallback = 0): number {
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : fallback
}

/** Validates and normalizes the POST body into a GenerationRequest. */
function parseRequest(body: unknown): GenerationRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const city = asString(b.city).trim()
  const country = asString(b.country).trim()
  const difficulty = b.difficulty as Difficulty
  if (!city || !country) return null
  if (!DIFFICULTIES.includes(difficulty)) return null

  const nbEtapes = Math.min(6, Math.max(3, Math.round(asNumber(b.nb_etapes, 5))))
  const duration = Math.max(30, Math.round(asNumber(b.duration_target_min, 120)))
  const specialties = Array.isArray(b.medical_specialties)
    ? b.medical_specialties.filter(
        (s): s is string => typeof s === 'string',
      )
    : []

  return {
    city,
    country,
    difficulty,
    duration_target_min: duration,
    medical_specialties: specialties,
    nb_etapes: nbEtapes,
    theme_preference: asString(b.theme_preference) || undefined,
    special_instructions: asString(b.special_instructions) || undefined,
  }
}

/** Pulls a JSON object out of the model's text response. */
function extractJson(text: string): GeneratedBalade {
  let raw = text.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?/i, '').replace(/```$/, '').trim()
  }
  const first = raw.indexOf('{')
  const last = raw.lastIndexOf('}')
  if (first === -1 || last === -1) throw new Error('no JSON object found')
  const parsed = JSON.parse(raw.slice(first, last + 1)) as GeneratedBalade
  if (!Array.isArray(parsed.etapes) || parsed.etapes.length === 0) {
    throw new Error('generated balade has no etapes')
  }
  return parsed
}
function isValidGeneratedBalade(x: unknown): x is GeneratedBalade {
  if (!x || typeof x !== 'object') return false
  const b = x as GeneratedBalade
  return typeof b.title === 'string' && Array.isArray(b.etapes) && b.etapes.length > 0
}
function parseAndValidateModelOutput(raw: string): { ok: true; data: GeneratedBalade } | { ok: false; errorType: string; details?: unknown } {
  if (!raw?.trim()) return { ok: false, errorType: 'EMPTY_OUTPUT' }
  try {
    const extracted = extractJson(raw)
    if (!isValidGeneratedBalade(extracted)) {
      return { ok: false, errorType: 'SCHEMA_VALIDATION_FAILED' }
    }
    return { ok: true, data: extracted }
  } catch (error) {
    return { ok: false, errorType: raw.includes('{') ? 'INVALID_JSON' : 'NO_JSON_FOUND', details: String(error) }
  }
}

function normalizeTheme(theme: Partial<ThemeColor> | undefined): ThemeColor {
  const isHex = (v: unknown): v is string =>
    typeof v === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(v)
  return {
    name: asString(theme?.name) || 'Sépia & Or',
    primary: isHex(theme?.primary) ? theme!.primary : '#7a1c2e',
    secondary: isHex(theme?.secondary) ? theme!.secondary : '#b8860b',
    accent: isHex(theme?.accent) ? theme!.accent : '#c4757a',
    bg: isHex(theme?.bg) ? theme!.bg : '#1a0f08',
  }
}

function assembleBalade(
  generated: GeneratedBalade,
  req: GenerationRequest,
  userId: string,
): Balade {
  const baladeId = crypto.randomUUID()

  const etapes: Etape[] = generated.etapes.map((e, idx) => {
    const order = asNumber(e.order, idx + 1)
    const lat = asNumber(e.lat)
    const lng = asNumber(e.lng)
    const enigmeType = ENIGME_TYPES.includes(e.enigme?.type as EnigmeType)
      ? (e.enigme.type as EnigmeType)
      : 'wordplay'

    const enigme: Enigme = {
      id: crypto.randomUUID(),
      type: enigmeType,
      title: asString(e.enigme?.title, 'Énigme'),
      instruction: asString(e.enigme?.instruction),
      cipher_display: asString(e.enigme?.cipher_display),
      hint: asString(e.enigme?.hint),
      answer: asString(e.enigme?.answer),
      answer_explanation: asString(e.enigme?.answer_explanation),
      difficulty: req.difficulty,
    }

    let medical: MedicalBonus | null = null
    if (e.medical_bonus) {
      const spec = SPECIALTIES.includes(
        e.medical_bonus.specialty as MedicalSpecialty,
      )
        ? (e.medical_bonus.specialty as MedicalSpecialty)
        : 'cardiologie'
      medical = {
        id: crypto.randomUUID(),
        specialty: spec,
        question: asString(e.medical_bonus.question),
        hint: asString(e.medical_bonus.hint),
        answer: asString(e.medical_bonus.answer),
        year_level: 5,
      }
    }

    return {
      id: crypto.randomUUID(),
      balade_id: baladeId,
      order,
      location_name: asString(e.location_name, `Étape ${order}`),
      lat,
      lng,
      maps_url: `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`,
      story_text: asString(e.story_text),
      direction_text: asString(e.direction_text),
      walk_minutes: asNumber(e.walk_minutes),
      enigme,
      action_mission: asString(e.action_mission),
      medical_bonus: medical,
    }
  })

  const medicalSpecs = Array.from(
    new Set(
      etapes
        .map((e) => e.medical_bonus?.specialty)
        .filter((s): s is MedicalSpecialty => Boolean(s)),
    ),
  )

  const balade: Balade = {
    id: baladeId,
    title: asString(generated.title, `Balade à ${req.city}`),
    city: req.city,
    country: req.country,
    theme_color: normalizeTheme(generated.theme_color),
    difficulty: req.difficulty,
    status: 'draft',
    created_by: userId,
    created_at: new Date().toISOString(),
    estimated_duration_min: asNumber(
      generated.estimated_duration_min,
      req.duration_target_min,
    ),
    distance_km: asNumber(generated.distance_km),
    html_content: '',
    etapes,
    medical_specs: medicalSpecs.length ? medicalSpecs : req.medical_specialties,
    story_context: asString(generated.story_context),
    prologue: asString(generated.prologue),
    epilogue: asString(generated.epilogue),
  }

  balade.html_content = renderBaladeHtml(balade)
  return balade
}

export async function POST(request: Request) {
  // 1. Authenticate.
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }

  // 2. Validate the request body.
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON invalide' }, { status: 400 })
  }
  const req = parseRequest(body)
  if (!req) {
    return NextResponse.json(
      { error: 'Paramètres de génération invalides' },
      { status: 400 },
    )
  }

  // 3. Pick the AI provider — user settings override the env-var fallback.
  const settings = await getUserSettings(supabase, user.id)
  const provider: AIProvider = settings?.ai_provider ?? 'anthropic'
  const apiKey =
    settings?.ai_api_key && settings.ai_api_key.length > 0
      ? settings.ai_api_key
      : undefined
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          'Aucune clé API personnelle configurée. Va dans Réglages et ajoute ta clé API.',
      },
      { status: 400 },
    )
  }
  const model =
    settings?.ai_model && settings.ai_model.length > 0
      ? settings.ai_model
      : 'claude-sonnet-4-6'

  // 4. Generate the balade content.
  let generated: GeneratedBalade
  try {
    const generationId = crypto.randomUUID()
    const output = await generateBaladeText(
      { provider, apiKey, model, difficulty: req.difficulty, generationId },
      GENERATION_SYSTEM_PROMPT,
      buildGenerationPrompt(req),
    )
    const parsed = parseAndValidateModelOutput(output.text)
    console.info('[LLM_GENERATION]', {
      generation_id: generationId,
      provider,
      model,
      difficulty: req.difficulty,
      input_tokens: output.usage.inputTokens,
      output_tokens: output.usage.outputTokens,
      total_tokens: output.usage.totalTokens,
      estimated_cost_usd: output.estimatedCostUsd,
      latency_ms: output.latencyMs,
      success: parsed.ok,
      error_type: parsed.ok ? null : parsed.errorType,
      city: req.city,
      route: req.country,
      retry_count: 0,
    })
    if (!parsed.ok) {
      throw new Error(parsed.errorType)
    }
    generated = parsed.data
  } catch (err) {
    console.error('Balade generation failed:', err)
    return NextResponse.json(
      { error: 'La génération a échoué. Vérifie ta clé API et réessaie.' },
      { status: 502 },
    )
  }

  // 5. Assemble, render, and persist.
  try {
    const balade = assembleBalade(generated, req, user.id)
    const baladeId = await saveGeneratedBalade(supabase, balade)
    return NextResponse.json({ balade_id: baladeId, status: 'draft' })
  } catch (err) {
    console.error('Saving generated balade failed:', err)
    return NextResponse.json(
      { error: "Impossible d'enregistrer la balade." },
      { status: 500 },
    )
  }
}
