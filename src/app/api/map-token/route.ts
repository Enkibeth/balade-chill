import { NextResponse } from 'next/server'
import { getSharedMapboxToken } from '@/lib/mapboxToken'

export const dynamic = 'force-dynamic'

/**
 * Serves the public Mapbox token to the static Chine page (public/chine.html),
 * which can't read build-time env vars and isn't tied to a logged-in user.
 * Resolution order (env var, then Supabase setting): see getSharedMapboxToken.
 * The token is never hardcoded in a committed file (avoids secret-scanning)
 * and stays in sync with what the user configured in the app.
 */
export async function GET() {
  const token = await getSharedMapboxToken()
  return NextResponse.json(
    { token },
    { headers: { 'Cache-Control': 'public, max-age=120' } },
  )
}
