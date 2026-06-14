import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'

/**
 * Serves the public Mapbox token to the static Chine page (public/chine.html),
 * which can't read build-time env vars. Single source of truth: the same
 * NEXT_PUBLIC_MAPBOX_TOKEN used by the rest of the app — so the token is never
 * hardcoded in a committed file (avoids secret-scanning) and stays in sync.
 * The token is a public `pk.` token, safe to expose to the client.
 */
export async function GET() {
  const token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
  return NextResponse.json(
    { token },
    { headers: { 'Cache-Control': 'public, max-age=300' } },
  )
}
