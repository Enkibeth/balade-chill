import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import {
  geocodeAddress,
  reverseGeocode,
  shortenDisplayName,
} from '@/lib/ai/geocode'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

/**
 * Geocodes a free-text place/address (via Nominatim) so the validation screen
 * can let the user retarget a single étape to a real location. Auth-gated to
 * avoid turning the app into an open geocoding proxy.
 */
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
  const query = typeof b.query === 'string' ? b.query.trim() : ''
  const city = typeof b.city === 'string' ? b.city.trim() : ''
  const country = typeof b.country === 'string' ? b.country.trim() : ''

  // Reverse mode: a point dropped on the map sends { lat, lng } (no query) and
  // gets back the exact place name so generation can anchor on coords + name.
  const lat = typeof b.lat === 'number' ? b.lat : Number(b.lat)
  const lng = typeof b.lng === 'number' ? b.lng : Number(b.lng)
  if (!query && Number.isFinite(lat) && Number.isFinite(lng)) {
    const place = await reverseGeocode(lat, lng)
    if (!place) {
      return NextResponse.json(
        { error: 'Lieu introuvable à cet endroit.' },
        { status: 404 },
      )
    }
    return NextResponse.json({
      lat: place.lat,
      lng: place.lng,
      displayName: shortenDisplayName(place.displayName),
    })
  }

  if (!query) {
    return NextResponse.json({ error: 'Adresse manquante' }, { status: 400 })
  }

  // Bias the search toward the balade's city/country when the user typed only a
  // place name (e.g. "Place des Vosges").
  const hasContext = /,/.test(query)
  const full = hasContext
    ? query
    : [query, city, country].filter(Boolean).join(', ')

  const place = (await geocodeAddress(full)) ?? (await geocodeAddress(query))
  if (!place) {
    return NextResponse.json(
      { error: 'Lieu introuvable. Précise le nom ou l’adresse.' },
      { status: 404 },
    )
  }

  return NextResponse.json({
    lat: place.lat,
    lng: place.lng,
    displayName: shortenDisplayName(place.displayName),
  })
}
