import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  getUserSettings,
  saveParcours,
  getParcoursByUser,
  deleteParcours,
} from '@/lib/supabase/queries'
import { generateBaladeText } from '@/lib/ai/providers'
import { geocodeAddress, shortenDisplayName } from '@/lib/ai/geocode'
import { orderStops } from '@/lib/ai/itinerary/optimize'
import { buildDirectionsUrls } from '@/lib/ai/itinerary/googleMaps'
import { haversineKm, pathLengthKm } from '@/lib/ai/itinerary/geo'
import type { Anchor, PointOfInterest } from '@/lib/ai/itinerary/types'
import {
  PARCOURS_SYSTEM_PROMPT,
  buildParcoursPrompt,
  parseParcours,
} from '@/lib/ai/parcours/prompt'
import { renderParcoursHtml } from '@/lib/ai/parcours/render-html'
import type {
  GeneratedParcours,
  ParcoursPoint,
  ParcoursRequest,
  ParcoursStop,
} from '@/lib/ai/parcours/types'
import type { AIProvider } from '@/types'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

// Nominatim caps us at ~1 req/s; throttle every geocoding call to stay polite.
const NOMINATIM_THROTTLE_MS = 1100
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
// Bound geocoding time and prompt size.
const MAX_PLACES = 20
// Rough estimates for the visit duration when the model isn't asked for it.
const WALK_KMH = 4.5
const VISIT_MIN_PER_STOP = 8

function asString(v: unknown): string {
  return typeof v === 'string' ? v : ''
}

/** Validates and normalizes the POST body into a ParcoursRequest. */
function parseRequest(body: unknown): ParcoursRequest | null {
  if (!body || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  const city = asString(b.city).trim()
  const country = asString(b.country).trim()
  if (!city || !country) return null

  const places = Array.isArray(b.places)
    ? b.places
        .map((p) => asString(p).trim())
        .filter(Boolean)
        .slice(0, MAX_PLACES)
    : []
  if (places.length < 2) return null

  const duration = Math.max(30, Math.round(Number(b.duration_target_min) || 120))
  return {
    city,
    country,
    duration_target_min: duration,
    places,
    start_point: parsePoint(b.start_point),
    end_point: parsePoint(b.end_point),
    start_address: asString(b.start_address).trim() || undefined,
    end_address: asString(b.end_address).trim() || undefined,
    loop: b.loop !== false,
    keep_order: b.keep_order === true,
  }
}

/** Parses a map-placed point {lat,lng,label}; null when invalid. */
function parsePoint(raw: unknown): ParcoursPoint | undefined {
  if (!raw || typeof raw !== 'object') return undefined
  const r = raw as Record<string, unknown>
  const lat = Number(r.lat)
  const lng = Number(r.lng)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined
  if (Math.abs(lat) > 90 || Math.abs(lng) > 180) return undefined
  const label = asString(r.label).trim()
  return { lat, lng, label: label || undefined }
}

/** A geocoded stop the user wants to see (kept name = what they typed). */
interface ResolvedPlace extends PointOfInterest {
  /** libellé affiché à l'utilisateur (ce qu'il a saisi) */
  displayName: string
}

/** Geocodes a free-text place within the city; null when not found. */
async function resolvePlace(
  input: string,
  city: string,
  country: string,
): Promise<ResolvedPlace | null> {
  const place = await geocodeAddress(
    [input, city, country].filter(Boolean).join(', '),
    { limit: 1 },
  )
  if (!place) return null
  return {
    // Disambiguate for Google Maps (named text link) while keeping the user's
    // own wording as the display label.
    name: `${input}, ${city}`,
    displayName: input,
    lat: place.lat,
    lng: place.lng,
  }
}

/** Turns a map-placed point into an anchor directly (no geocoding). */
function pointToAnchor(
  point: ParcoursPoint | undefined,
  fallbackName: string,
): Anchor | null {
  if (!point) return null
  return {
    name: point.label?.trim() || fallbackName,
    lat: point.lat,
    lng: point.lng,
  }
}

async function resolveAnchor(
  address: string | undefined,
  city: string,
  country: string,
): Promise<Anchor | null> {
  if (!address) return null
  const place = await geocodeAddress(
    [address, city, country].filter(Boolean).join(', '),
    { limit: 1 },
  )
  if (!place) return null
  return { name: shortenDisplayName(place.displayName), lat: place.lat, lng: place.lng }
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
      { error: 'Renseigne la ville, le pays et au moins 2 lieux.' },
      { status: 400 },
    )
  }

  // 3. Resolve the AI provider from user settings (same keys as the balades).
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

  // 4. Geocode every place (free, throttled). Unresolved ones are reported.
  const resolved: ResolvedPlace[] = []
  const unresolved: string[] = []
  for (const input of req.places) {
    const place = await resolvePlace(input, req.city, req.country)
    if (place) resolved.push(place)
    else unresolved.push(input)
    await sleep(NOMINATIM_THROTTLE_MS)
  }
  if (resolved.length < 2) {
    return NextResponse.json(
      {
        error:
          'Impossible de localiser au moins 2 lieux. Précise les noms (ex. « Grosse Cloche, Bordeaux »).',
        unresolved,
      },
      { status: 422 },
    )
  }

  // 5. Resolve start/end anchors. Priority: a map-placed point (no geocoding
  //    needed) > a free-text address > fallback to a place. A missing start
  //    falls back to the first place; a loop returns to the start; otherwise
  //    the last place is the end.
  let startAddrAnchor: Anchor | null = pointToAnchor(req.start_point, 'Départ')
  if (!startAddrAnchor && req.start_address) {
    startAddrAnchor = await resolveAnchor(req.start_address, req.city, req.country)
    await sleep(NOMINATIM_THROTTLE_MS)
  }
  let endAddrAnchor: Anchor | null = null
  if (!req.loop) {
    endAddrAnchor = pointToAnchor(req.end_point, 'Arrivée')
    if (!endAddrAnchor && req.end_address) {
      endAddrAnchor = await resolveAnchor(req.end_address, req.city, req.country)
      await sleep(NOMINATIM_THROTTLE_MS)
    }
  }

  const startIsPlace = !startAddrAnchor
  const endIsPlace = !req.loop && !endAddrAnchor

  // Places consumed as anchors are not also intermediate waypoints.
  let middle = [...resolved]
  const startAnchor: Anchor = startAddrAnchor ?? middle[0]
  if (startIsPlace) middle = middle.slice(1)
  let endPlace: ResolvedPlace | null = null
  if (endIsPlace && middle.length > 0) {
    endPlace = middle[middle.length - 1]
    middle = middle.slice(0, -1)
  }
  const endAnchor: Anchor = req.loop ? startAnchor : endAddrAnchor ?? endPlace ?? startAnchor

  // 6. Order the intermediate stops (optimize unless the user kept their order).
  const orderedMiddle = req.keep_order
    ? middle
    : (orderStops(middle, { start: startAnchor, end: endAnchor }) as ResolvedPlace[])

  // Full ordered list of stops we actually describe (anchors that are real
  // places are described; free-text address anchors are just routing points).
  const describedStops: ResolvedPlace[] = [
    ...(startIsPlace ? [resolved[0]] : []),
    ...orderedMiddle,
    ...(endPlace ? [endPlace] : []),
  ]

  // 7. Build the named Google Maps itinerary link(s) and the geometry totals.
  const googleMapsUrls = buildDirectionsUrls(
    startAnchor,
    endAnchor,
    orderedMiddle,
    'walking',
  )
  const routePoints = [startAnchor, ...orderedMiddle, endAnchor]
  const distanceKm = Math.round(pathLengthKm(routePoints) * 10) / 10
  const isLoop = req.loop || haversineKm(startAnchor, endAnchor) < 0.15
  const estimatedDurationMin = Math.round(
    (distanceKm / WALK_KMH) * 60 + describedStops.length * VISIT_MIN_PER_STOP,
  )

  // 8. Ask the model for the text only (title, intro, per-stop anecdote + Q/A).
  const generationId = crypto.randomUUID()
  let llm
  try {
    const output = await generateBaladeText(
      {
        provider,
        apiKey,
        model,
        difficulty: 'facile',
        generationId,
        maxTokensOverride: Math.min(4000, 400 + describedStops.length * 320),
      },
      PARCOURS_SYSTEM_PROMPT,
      buildParcoursPrompt({
        city: req.city,
        country: req.country,
        duration_target_min: req.duration_target_min,
        orderedStopNames: describedStops.map((s) => s.displayName),
      }),
    )
    llm = parseParcours(output.text)
    console.info('[LLM_GENERATION]', {
      generation_id: generationId,
      stage: 'parcours',
      provider,
      model,
      input_tokens: output.usage.inputTokens,
      output_tokens: output.usage.outputTokens,
      estimated_cost_usd: output.estimatedCostUsd,
      latency_ms: output.latencyMs,
      success: Boolean(llm),
      stops: describedStops.length,
      city: req.city,
    })
  } catch (err) {
    console.error('Parcours generation failed:', err)
    return NextResponse.json(
      { error: 'La génération a échoué. Vérifie ta clé API et réessaie.' },
      { status: 502 },
    )
  }
  if (!llm) {
    return NextResponse.json(
      { error: 'Le modèle a renvoyé un format inattendu. Réessaie.' },
      { status: 502 },
    )
  }

  // 9. Zip the model's text back onto the ordered stops (by index, then name).
  const byName = new Map(
    llm.stops.map((s) => [s.name.trim().toLowerCase(), s] as const),
  )
  const stops: ParcoursStop[] = describedStops.map((stop, i) => {
    const match =
      llm!.stops[i] ?? byName.get(stop.displayName.trim().toLowerCase())
    return {
      name: stop.displayName,
      lat: stop.lat,
      lng: stop.lng,
      anecdote: match?.anecdote ?? '',
      question: match?.question ?? '',
      answer: match?.answer ?? '',
    }
  })

  const parcours: GeneratedParcours = {
    title: llm.title,
    intro: llm.intro,
    city: req.city,
    country: req.country,
    stops,
    google_maps_urls: googleMapsUrls,
    distance_km: distanceKm,
    estimated_duration_min: estimatedDurationMin,
    is_loop: isLoop,
    unresolved,
  }

  // 10. Persist server-side (multi-device sync) and return the stored record.
  const html = renderParcoursHtml(parcours)
  try {
    const record = await saveParcours(supabase, parcours, html, user.id)
    return NextResponse.json({ record })
  } catch (err) {
    // Saving failed (e.g. table missing) — still return the result so the
    // client can show it and fall back to local-only storage.
    console.error('Saving parcours failed (returning unsaved):', err)
    return NextResponse.json({ parcours, html })
  }
}

/** Lists the caller's parcours (own + partner's), newest first. */
export async function GET() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  try {
    const records = await getParcoursByUser(supabase, user.id)
    return NextResponse.json({ records })
  } catch (err) {
    console.error('Listing parcours failed:', err)
    return NextResponse.json({ error: 'Lecture impossible.' }, { status: 500 })
  }
}

/** Deletes one of the caller's parcours (?id=…). */
export async function DELETE(request: Request) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })
  }
  const id = new URL(request.url).searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'id manquant' }, { status: 400 })
  }
  try {
    await deleteParcours(supabase, id)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.error('Deleting parcours failed:', err)
    return NextResponse.json({ error: 'Suppression impossible.' }, { status: 500 })
  }
}
