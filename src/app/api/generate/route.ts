import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getUserSettings,
  saveGeneratedBalade,
} from '@/lib/supabase/queries'
import {
  GENERATION_SYSTEM_PROMPT,
  buildGenerationPrompt,
} from '@/lib/ai/generation-prompt'
import { renderBaladeHtml } from '@/lib/ai/render-html'
import { generateBaladeText } from '@/lib/ai/providers'
import type { LLMGenerationResult } from '@/lib/ai/providers'
import { getModelOutputBudget } from '@/lib/ai/modelLimits'
import { describeProviderError } from '@/lib/ai/errors'
import { extractJsonObject } from '@/lib/ai/json'
import { BALADE_SCHEMA } from '@/lib/ai/schemas'
import { getSharedMapboxToken } from '@/lib/mapboxToken'
import type { GeneratedBalade } from '@/lib/ai/generated'
import {
  REFINE_SYSTEM_PROMPT,
  applyRefinePatch,
  buildRefinePrompt,
  refineMaxTokens,
  shouldRefine,
} from '@/lib/ai/refine'
import { validateAndFixEnigme } from '@/lib/ai/cipherCheck'
import { applyDistancesAndTime, haversineKm } from '@/lib/ai/routeMath'
import { validateEtapeGeography } from '@/lib/ai/geoValidate'
import {
  geocodeAddress,
  geocodeAddressMapbox,
  shortenDisplayName,
  type GeocodeOptions,
  type GeocodedPlace,
} from '@/lib/ai/geocode'
import { bonusCategoryDef, isBonusCategory } from '@/lib/ai/bonus'
import { pointMapsUrl } from '@/lib/ai/mapsUrl'
import type {
  AIProvider,
  Balade,
  BonusCategory,
  Difficulty,
  Enigme,
  EnigmeType,
  Etape,
  GenerationRequest,
  GeoPoint,
  MedicalBonus,
  MedicalSpecialty,
  ThemeColor,
} from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Snap an étape onto its geocoded POI only when that POI sits within this many
// km of the model's coordinate. Generous enough to fix area-vs-feature drift
// (e.g. a park centroid vs the fountain inside it) without letting a same-named
// place across town hijack the étape.
const SNAP_MAX_KM = 2
// Nominatim's usage policy caps us at ~1 request/second; space the geocoding
// calls so a generation never bursts past it.
const NOMINATIM_THROTTLE_MS = 1100
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// One automatic re-attempt when the draft comes back unusable or the provider
// hiccups — most parse failures are one-off model slips.
const MAX_DRAFT_ATTEMPTS = 2
// Keep the requested duration in a sane band (the UI slider stops at 240).
const MAX_DURATION_TARGET_MIN = 600

const DIFFICULTIES: Difficulty[] = ['facile', 'moyen', 'difficile', 'boss']
const ENIGME_TYPES: EnigmeType[] = [
  'cipher_reverse',
  'cipher_caesar',
  'math_code',
  'polybe',
  'wordplay',
  'anagram',
  'morse',
  'a1z26',
  'vigenere',
  'charade',
  'rebus',
  'acrostiche',
  'riddle',
]
const SPECIALTIES: MedicalSpecialty[] = [
  'cardiologie',
  'neurologie',
  'pneumologie',
  'gastro',
  'urgences',
]

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
  const duration = Math.min(
    MAX_DURATION_TARGET_MIN,
    Math.max(30, Math.round(asNumber(b.duration_target_min, 120))),
  )
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
    bonus_themes: parseBonusThemes(b.bonus_themes),
    bonus_custom_theme: asString(b.bonus_custom_theme).trim() || undefined,
    loop_address: asString(b.loop_address).trim() || undefined,
    start_point: parseGeoPoint(b.start_point),
    end_point: parseGeoPoint(b.end_point),
    quiz_answers: parseQuizAnswers(b.quiz_answers),
  }
}

function parseBonusThemes(raw: unknown): BonusCategory[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const themes = raw.filter(isBonusCategory)
  return themes.length ? Array.from(new Set(themes)) : undefined
}

function parseGeoPoint(raw: unknown): GeoPoint | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const lat = asNumber(r.lat, NaN)
  const lng = asNumber(r.lng, NaN)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined
  const label = asString(r.label).trim()
  return { lat, lng, label: label || undefined }
}

/** Turns a map-placed point into the GeocodedPlace shape the prompt expects. */
function geoPointToPlace(p: GeoPoint): GeocodedPlace {
  return {
    lat: p.lat,
    lng: p.lng,
    displayName: p.label?.trim() || `${p.lat.toFixed(5)}, ${p.lng.toFixed(5)}`,
  }
}

function parseQuizAnswers(raw: unknown) {
  if (!Array.isArray(raw)) return undefined
  const answers = raw
    .map((a) => {
      if (!a || typeof a !== 'object') return null
      const r = a as Record<string, unknown>
      const question_label = asString(r.question_label).trim()
      const option_label = asString(r.option_label).trim()
      return question_label && option_label
        ? { question_label, option_label }
        : null
    })
    .filter((x): x is { question_label: string; option_label: string } => x !== null)
  return answers.length ? answers : undefined
}

type ParseErrorType =
  | 'EMPTY_OUTPUT'
  | 'NO_JSON_FOUND'
  | 'INVALID_JSON'
  | 'SCHEMA_VALIDATION_FAILED'
  | 'TRUNCATED_OUTPUT'

function hasBalancedCurlyBraces(text: string): boolean {
  let depth = 0
  for (const char of text) {
    if (char === '{') depth += 1
    if (char === '}') depth -= 1
    if (depth < 0) return false
  }
  return depth === 0
}

function isLikelyTruncatedOutput(text: string): boolean {
  const trimmed = text.trim()
  if (!trimmed) return false
  if (!trimmed.includes('{')) return false
  return !trimmed.endsWith('}') || !hasBalancedCurlyBraces(trimmed)
}
function isValidGeneratedBalade(x: unknown): x is GeneratedBalade {
  if (!x || typeof x !== 'object') return false
  const b = x as GeneratedBalade
  return typeof b.title === 'string' && Array.isArray(b.etapes) && b.etapes.length > 0
}
/**
 * Parses the model output into a balade. The parse is attempted FIRST — the
 * brace-balance heuristic can misread braces inside JSON strings, so it only
 * runs to classify an already-failed parse. `truncated` is the provider's own
 * stop-reason signal and wins over the heuristic.
 */
function parseAndValidateModelOutput(
  raw: string,
  truncated: boolean,
): { ok: true; data: GeneratedBalade } | { ok: false; errorType: ParseErrorType } {
  if (!raw?.trim()) return { ok: false, errorType: 'EMPTY_OUTPUT' }
  const extracted = extractJsonObject(raw)
  if (extracted !== null) {
    if (isValidGeneratedBalade(extracted)) {
      return { ok: true, data: extracted }
    }
    return {
      ok: false,
      errorType: truncated ? 'TRUNCATED_OUTPUT' : 'SCHEMA_VALIDATION_FAILED',
    }
  }
  if (truncated || isLikelyTruncatedOutput(raw)) {
    return { ok: false, errorType: 'TRUNCATED_OUTPUT' }
  }
  return {
    ok: false,
    errorType: raw.includes('{') ? 'INVALID_JSON' : 'NO_JSON_FOUND',
  }
}

function parseFailureMessage(errorType: ParseErrorType): string {
  if (errorType === 'TRUNCATED_OUTPUT') {
    return 'La réponse du modèle a été tronquée deux fois de suite. Réduis le nombre d’étapes ou choisis un modèle avec plus de capacité de sortie dans les Réglages.'
  }
  return 'Le modèle n’a pas renvoyé une balade exploitable malgré deux tentatives. Réessaie, ou choisis un modèle plus fiable dans les Réglages.'
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
      const mb = e.medical_bonus
      const category: BonusCategory = isBonusCategory(mb.category)
        ? mb.category
        : 'medical'
      const label = asString(mb.label).trim()
      if (category === 'medical') {
        const spec = SPECIALTIES.includes(mb.specialty as MedicalSpecialty)
          ? (mb.specialty as MedicalSpecialty)
          : 'cardiologie'
        medical = {
          id: crypto.randomUUID(),
          category,
          label: label || spec,
          specialty: spec,
          question: asString(mb.question),
          hint: asString(mb.hint),
          answer: asString(mb.answer),
          year_level: 5,
        }
      } else {
        medical = {
          id: crypto.randomUUID(),
          category,
          label: label || bonusCategoryDef(category).defaultBadge,
          question: asString(mb.question),
          hint: asString(mb.hint),
          answer: asString(mb.answer),
        }
      }
    }

    return {
      id: crypto.randomUUID(),
      balade_id: baladeId,
      order,
      location_name: asString(e.location_name, `Étape ${order}`),
      lat,
      lng,
      maps_url: pointMapsUrl(lat, lng),
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

/** Progress/terminal events streamed to the client as NDJSON lines. */
type GenerationEvent =
  | {
      type: 'progress'
      stage: string
      label: string
      current?: number
      total?: number
    }
  | { type: 'done'; balade_id: string; status: 'draft' }
  | { type: 'error'; error: string }

/** Raised for failures that already carry a user-facing French message. */
class GenerationError extends Error {}

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

  // 4. Inputs are valid: stream the real pipeline progress as NDJSON so the
  // user watches actual stages instead of a fake timer. Errors past this point
  // arrive in-stream (the HTTP status is already committed).
  const encoder = new TextEncoder()
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: GenerationEvent) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + '\n'))
        } catch {
          // Client went away — keep working; the balade still gets saved.
        }
      }
      try {
        await runGenerationPipeline({
          req,
          userId: user.id,
          supabase,
          settings,
          provider,
          apiKey,
          model,
          send,
        })
      } catch (err) {
        if (err instanceof GenerationError) {
          send({ type: 'error', error: err.message })
        } else {
          console.error('Balade generation failed:', err)
          send({
            type: 'error',
            error: 'La génération a échoué. Réessaie dans un instant.',
          })
        }
      } finally {
        controller.close()
      }
    },
  })
  return new Response(stream, {
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store',
      // Disable proxy buffering so progress lines reach the client live.
      'X-Accel-Buffering': 'no',
    },
  })
}

async function runGenerationPipeline(input: {
  req: GenerationRequest
  userId: string
  supabase: ReturnType<typeof createClient>
  settings: Awaited<ReturnType<typeof getUserSettings>>
  provider: AIProvider
  apiKey: string
  model: string
  send: (event: GenerationEvent) => void
}) {
  const { req, userId, supabase, settings, provider, apiKey, model, send } =
    input

  // Nominatim-politeness: serialize the calls (they may be issued from
  // parallel contexts) and wait out only the *remaining* gap since the last
  // one instead of sleeping a fixed delay after every étape.
  let lastGeocodeAt = 0
  let nominatimChain: Promise<unknown> = Promise.resolve()
  const politeGeocode = (
    address: string,
    opts?: GeocodeOptions,
  ): Promise<GeocodedPlace | null> => {
    const run = nominatimChain.then(async () => {
      const wait = lastGeocodeAt + NOMINATIM_THROTTLE_MS - Date.now()
      if (wait > 0) await sleep(wait)
      try {
        return await geocodeAddress(address, opts)
      } finally {
        lastGeocodeAt = Date.now()
      }
    })
    nominatimChain = run.catch(() => undefined)
    return run
  }

  // Mapbox (when the shared token is configured) has no 1 req/s policy, so
  // geocoding can fan out in parallel; Nominatim stays as the fallback.
  const mapboxToken = await getSharedMapboxToken()
  const smartGeocode = async (
    address: string,
    opts: GeocodeOptions = {},
  ): Promise<GeocodedPlace | null> => {
    if (mapboxToken) {
      const place = await geocodeAddressMapbox(address, opts, mapboxToken)
      if (place) return place
    }
    return politeGeocode(address, opts)
  }

  // Resolve the start/end anchors. Map-placed points win; otherwise fall back
  // to geocoding the free-text loop address (start = end = that address).
  let startPin: GeocodedPlace | null = req.start_point
    ? geoPointToPlace(req.start_point)
    : null
  let endPin: GeocodedPlace | null = req.end_point
    ? geoPointToPlace(req.end_point)
    : null
  if (!startPin && !endPin && req.loop_address) {
    send({
      type: 'progress',
      stage: 'anchors',
      label: 'Repérage du point de départ…',
    })
    const geo = await smartGeocode(req.loop_address)
    if (geo) {
      startPin = geo
      endPin = geo
    }
  }

  // 4a. Draft the balade content with the (cheap) primary model, retrying once
  // on a classified failure: truncation gets a bigger output budget (where the
  // provider allows it), everything else gets a fresh sample.
  send({
    type: 'progress',
    stage: 'draft',
    label: 'Écriture du récit, des étapes et des énigmes…',
  })
  const generationId = crypto.randomUUID()
  const userPrompt = buildGenerationPrompt(req, { startPin, endPin })
  let maxTokens = getModelOutputBudget({
    model,
    difficulty: req.difficulty,
    generationMode: req.difficulty === 'boss' ? 'segmented' : 'full',
  })
  let generated: GeneratedBalade | null = null
  let lastParseError: ParseErrorType = 'EMPTY_OUTPUT'

  for (let attempt = 0; attempt < MAX_DRAFT_ATTEMPTS && !generated; attempt++) {
    let output: LLMGenerationResult
    try {
      output = await generateBaladeText(
        {
          provider,
          apiKey,
          model,
          difficulty: req.difficulty,
          generationId,
          maxTokensOverride: maxTokens,
          jsonSchema: BALADE_SCHEMA,
        },
        GENERATION_SYSTEM_PROMPT,
        userPrompt,
      )
    } catch (err) {
      const info = describeProviderError(provider, err)
      console.error('Balade draft call failed:', err)
      console.info('[LLM_GENERATION]', {
        generation_id: generationId,
        stage: 'draft',
        provider,
        model,
        difficulty: req.difficulty,
        success: false,
        error_type: 'PROVIDER_ERROR',
        retry_count: attempt,
        city: req.city,
        route: req.country,
      })
      if (info.retryable && attempt + 1 < MAX_DRAFT_ATTEMPTS) {
        send({
          type: 'progress',
          stage: 'draft_retry',
          label: 'Le fournisseur a hoqueté — nouvelle tentative…',
        })
        await sleep(2000)
        continue
      }
      throw new GenerationError(info.message)
    }

    const parsed = parseAndValidateModelOutput(output.text, output.truncated)
    console.info('[LLM_GENERATION]', {
      generation_id: generationId,
      stage: 'draft',
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
      truncated: output.truncated,
      max_tokens: maxTokens,
      city: req.city,
      route: req.country,
      retry_count: attempt,
    })
    if (parsed.ok) {
      generated = parsed.data
      break
    }
    lastParseError = parsed.errorType
    if (attempt + 1 < MAX_DRAFT_ATTEMPTS) {
      if (parsed.errorType === 'TRUNCATED_OUTPUT' && provider === 'anthropic') {
        // Anthropic models comfortably allow a bigger output window; other
        // providers sit near their ceiling already, so retry with a fresh
        // sample instead (verbose runs usually don't repeat).
        maxTokens = Math.min(Math.round(maxTokens * 1.5), 32000)
      }
      send({
        type: 'progress',
        stage: 'draft_retry',
        label:
          parsed.errorType === 'TRUNCATED_OUTPUT'
            ? 'Réponse tronquée — nouvelle tentative avec plus de marge…'
            : 'Réponse imparfaite — nouvelle tentative…',
      })
    }
  }
  if (!generated) {
    throw new GenerationError(parseFailureMessage(lastParseError))
  }

  // 4b. Optional refine pass: a stronger model re-checks key parts and returns
  // only corrections. Failures here never block the (already valid) draft.
  const refine = settings?.generation_pipeline?.refine
  if (shouldRefine(refine, req.difficulty)) {
    send({
      type: 'progress',
      stage: 'refine',
      label: 'Relecture par le modèle de contrôle…',
    })
    try {
      const output = await generateBaladeText(
        {
          provider: refine.provider,
          apiKey: refine.apiKey as string,
          model: refine.model,
          difficulty: req.difficulty,
          generationId,
          maxTokensOverride: refineMaxTokens(generated.etapes.length),
        },
        REFINE_SYSTEM_PROMPT,
        buildRefinePrompt({
          draft: generated,
          targets: refine.targets,
          city: req.city,
          country: req.country,
          difficulty: req.difficulty,
        }),
      )
      const { balade, appliedFixes } = applyRefinePatch(
        generated,
        output.text,
        refine.targets,
      )
      generated = balade
      console.info('[LLM_GENERATION]', {
        generation_id: generationId,
        stage: 'refine',
        provider: refine.provider,
        model: refine.model,
        difficulty: req.difficulty,
        input_tokens: output.usage.inputTokens,
        output_tokens: output.usage.outputTokens,
        total_tokens: output.usage.totalTokens,
        estimated_cost_usd: output.estimatedCostUsd,
        latency_ms: output.latencyMs,
        success: true,
        targets: refine.targets,
        applied_fixes: appliedFixes,
        city: req.city,
        route: req.country,
      })
    } catch (err) {
      console.error('Refine pass failed (keeping draft):', err)
    }
  }

  // 4c. Free deterministic safety net: make sure mechanical ciphers really
  // decode to their answer, auto-fixing the ones we can without any LLM call.
  send({
    type: 'progress',
    stage: 'cipher_check',
    label: 'Vérification des énigmes…',
  })
  let cipherFixes = 0
  generated.etapes = generated.etapes.map((etape) => {
    const { enigme, fixed } = validateAndFixEnigme(etape.enigme)
    if (fixed) cipherFixes += 1
    return fixed ? { ...etape, enigme } : etape
  })
  if (cipherFixes > 0) {
    console.info('[LLM_GENERATION]', {
      generation_id: generationId,
      stage: 'cipher_check',
      difficulty: req.difficulty,
      cipher_fixes: cipherFixes,
      city: req.city,
      route: req.country,
    })
  }

  // 4c-bis. Snap each étape onto the real coordinates of its named place. The
  // model reliably *names* a real POI but routinely returns an imprecise
  // coordinate — e.g. the centre of the Jardin du Luxembourg instead of the
  // Fontaine Médicis inside it. The name is the source of truth the récit,
  // énigme and mission are written around, so we re-geocode it and move the pin
  // (and the Maps link) onto the exact place. We only snap when the geocoded
  // POI is close to the model's coordinate, so an ambiguous same-named place
  // across town can't hijack the étape; the user-pinned start/end (handled just
  // below) are skipped here since they are forced to the pin anyway.
  {
    const sortedForSnap = [...generated.etapes].sort((a, b) => a.order - b.order)
    const skip = new Set<GeneratedBalade['etapes'][number]>()
    if (startPin && sortedForSnap[0]) skip.add(sortedForSnap[0])
    if (endPin && sortedForSnap[sortedForSnap.length - 1]) {
      skip.add(sortedForSnap[sortedForSnap.length - 1])
    }
    const candidates = generated.etapes.filter(
      (etape) => !skip.has(etape) && asString(etape.location_name).trim(),
    )
    let snapFixes = 0
    let done = 0
    const snapOne = async (etape: GeneratedBalade['etapes'][number]) => {
      const name = asString(etape.location_name).trim()
      const hasCoords =
        Number.isFinite(etape.lat) && Number.isFinite(etape.lng)
      const place = await smartGeocode(
        [name, req.city, req.country].filter(Boolean).join(', '),
        hasCoords
          ? { near: { lat: etape.lat, lng: etape.lng }, limit: 5 }
          : { limit: 1 },
      )
      done += 1
      send({
        type: 'progress',
        stage: 'snap',
        label: 'Calage des lieux sur la carte…',
        current: done,
        total: candidates.length,
      })
      if (place) {
        const drift = hasCoords
          ? haversineKm(etape.lat, etape.lng, place.lat, place.lng)
          : 0
        if (drift <= SNAP_MAX_KM) {
          etape.lat = place.lat
          etape.lng = place.lng
          etape.location_name = shortenDisplayName(place.displayName)
          snapFixes += 1
        }
      }
    }
    if (candidates.length > 0) {
      send({
        type: 'progress',
        stage: 'snap',
        label: 'Calage des lieux sur la carte…',
        current: 0,
        total: candidates.length,
      })
      if (mapboxToken) {
        // Mapbox tolerates bursts — snap every étape at once (seconds instead
        // of ~1.1s per étape on Nominatim).
        await Promise.all(candidates.map(snapOne))
      } else {
        for (const etape of candidates) await snapOne(etape)
      }
    }
    if (snapFixes > 0) {
      console.info('[LLM_GENERATION]', {
        generation_id: generationId,
        stage: 'snap_etape_poi',
        snap_fixes: snapFixes,
        total_etapes: generated.etapes.length,
        geocoder: mapboxToken ? 'mapbox' : 'nominatim',
        city: req.city,
        route: req.country,
      })
    }
  }

  send({
    type: 'progress',
    stage: 'finalize',
    label: 'Distances, durées et mise en page…',
  })

  // 4d. Force the first/last étape onto the user-pinned start/end when the model
  // drifted by more than 200 m (start = end ⇒ loop).
  if (startPin || endPin) {
    const sorted = [...generated.etapes].sort((a, b) => a.order - b.order)
    let pinFixes = 0
    const forcePin = (
      etape: GeneratedBalade['etapes'][number] | undefined,
      place: GeocodedPlace | null,
    ) => {
      if (!etape || !place) return
      const drift =
        Number.isFinite(etape.lat) && Number.isFinite(etape.lng)
          ? haversineKm(etape.lat, etape.lng, place.lat, place.lng)
          : Infinity
      if (drift > 0.2) {
        etape.lat = place.lat
        etape.lng = place.lng
        etape.location_name = shortenDisplayName(place.displayName)
        pinFixes += 1
      }
    }
    forcePin(sorted[0], startPin)
    forcePin(sorted[sorted.length - 1], endPin)
    if (pinFixes > 0) {
      console.info('[LLM_GENERATION]', {
        generation_id: generationId,
        stage: 'pin_start_end',
        pin_fixes: pinFixes,
        has_start: Boolean(startPin),
        has_end: Boolean(endPin),
      })
    }
  }

  // 4d-bis. Geographic sanity net. The balade distance is derived purely from
  // the étape coordinates, so a single hallucinated lat/lng (common with weak
  // free models) silently yields an absurd 300-600 km "walk" or étapes nowhere
  // near the requested city. Anchor on the user pin if present, otherwise on the
  // geocoded city centre. The draft is kept either way — the validation screen
  // flags the offending étape(s) for a one-tap fix.
  const center =
    startPin ?? endPin ?? (await smartGeocode(`${req.city}, ${req.country}`))
  if (center) {
    const geo = validateEtapeGeography(generated.etapes, center, {
      durationTargetMin: req.duration_target_min,
    })
    if (!geo.ok) {
      console.warn('[LLM_GENERATION]', {
        generation_id: generationId,
        stage: 'geo_validation',
        provider,
        model,
        difficulty: req.difficulty,
        success: false,
        kept_draft: true,
        reason: geo.reason,
        offending_order: geo.offendingOrder,
        route_km: geo.routeKm,
        max_leg_km: geo.maxLegKm,
        max_distance_from_center_km: geo.maxDistanceFromCenterKm,
        budget_km: geo.budgetKm,
        duration_target_min: req.duration_target_min,
        city: req.city,
        route: req.country,
      })
    }
  }

  // 4e. Deterministic distance/time from the final coordinates, replacing the
  // model's guesses. Free, accurate, removes a whole class of bugs.
  const totals = applyDistancesAndTime(generated.etapes)
  generated.distance_km = totals.distance_km
  generated.estimated_duration_min = totals.estimated_duration_min

  // 5. Assemble, render, and persist.
  try {
    const balade = assembleBalade(generated, req, userId)
    const baladeId = await saveGeneratedBalade(supabase, balade)
    send({ type: 'done', balade_id: baladeId, status: 'draft' })
  } catch (err) {
    console.error('Saving generated balade failed:', err)
    throw new GenerationError(
      'La balade a bien été générée mais son enregistrement a échoué. Réessaie dans un instant.',
    )
  }
}
