import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getUserSettings } from '@/lib/supabase/queries'
import { generateBaladeText } from '@/lib/ai/providers'
import {
  PLACES_SYSTEM_PROMPT,
  buildPlacesPrompt,
  parsePlaces,
  type PlacesMode,
} from '@/lib/ai/parcours/places-prompt'
import type { AIProvider } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 120

const MAX_PLACES_IN = 30

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
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
  const mode: PlacesMode = b.mode === 'enrich' ? 'enrich' : 'suggest'
  if (!city || !country) {
    return NextResponse.json(
      { error: 'Renseigne la ville et le pays.' },
      { status: 400 },
    )
  }
  const places = Array.isArray(b.places)
    ? b.places.map((p) => asString(p).trim()).filter(Boolean).slice(0, MAX_PLACES_IN)
    : []
  if (mode === 'enrich' && places.length === 0) {
    return NextResponse.json(
      { error: 'Ajoute au moins un lieu à vérifier.' },
      { status: 400 },
    )
  }

  const settings = await getUserSettings(supabase, user.id)
  const provider: AIProvider = settings?.ai_provider ?? 'anthropic'
  const apiKey =
    settings?.ai_api_key && settings.ai_api_key.length > 0
      ? settings.ai_api_key
      : undefined
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Aucune clé API personnelle configurée. Va dans Réglages.' },
      { status: 400 },
    )
  }
  const model =
    settings?.ai_model && settings.ai_model.length > 0
      ? settings.ai_model
      : 'claude-sonnet-4-6'

  const generationId = crypto.randomUUID()
  try {
    const output = await generateBaladeText(
      { provider, apiKey, model, difficulty: 'facile', generationId, maxTokensOverride: 1500 },
      PLACES_SYSTEM_PROMPT,
      buildPlacesPrompt({
        mode,
        city,
        country,
        interests: asString(b.interests).trim() || undefined,
        places,
      }),
    )
    const parsed = parsePlaces(output.text)
    console.info('[LLM_GENERATION]', {
      generation_id: generationId,
      stage: 'parcours_places',
      provider,
      model,
      mode,
      input_tokens: output.usage.inputTokens,
      output_tokens: output.usage.outputTokens,
      estimated_cost_usd: output.estimatedCostUsd,
      latency_ms: output.latencyMs,
      success: Boolean(parsed),
      city,
    })
    if (!parsed) {
      return NextResponse.json(
        { error: 'Le modèle a renvoyé un format inattendu. Réessaie.' },
        { status: 502 },
      )
    }
    return NextResponse.json({ places: parsed })
  } catch (err) {
    console.error('Places suggestion failed:', err)
    return NextResponse.json(
      { error: 'La suggestion a échoué. Vérifie ta clé API et réessaie.' },
      { status: 502 },
    )
  }
}
