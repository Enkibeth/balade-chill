import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

export const dynamic = 'force-dynamic'

/**
 * Serves the public Mapbox token to the static Chine page (public/chine.html),
 * which can't read build-time env vars and isn't tied to a logged-in user.
 *
 * Source order:
 *  1. NEXT_PUBLIC_MAPBOX_TOKEN (env var, if configured on the host)
 *  2. a saved user setting (user_settings.mapbox_token) — same token the
 *     dashboard map uses. This is a public `pk.` token, safe to expose.
 *
 * The token is never hardcoded in a committed file (avoids secret-scanning)
 * and stays in sync with what the user configured in the app.
 */
export async function GET() {
  let token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

  if (!token) {
    try {
      const admin = createAdminClient()
      const { data } = await admin
        .from('user_settings')
        .select('mapbox_token, updated_at')
        .not('mapbox_token', 'is', null)
        .order('updated_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      token = data?.mapbox_token ?? ''
    } catch {
      // Fall through with empty token; the page falls back to the SVG map.
    }
  }

  return NextResponse.json(
    { token },
    { headers: { 'Cache-Control': 'public, max-age=120' } },
  )
}
