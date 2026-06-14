import { NextResponse } from 'next/server'
import { createClient as createSupabaseClient } from '@supabase/supabase-js'

export const dynamic = 'force-dynamic'

/**
 * Serves the public Mapbox token to the static Chine page (public/chine.html),
 * which can't read build-time env vars and isn't tied to a logged-in user.
 *
 * Source order:
 *  1. NEXT_PUBLIC_MAPBOX_TOKEN (env var, if configured on the host)
 *  2. the saved user setting, read via the `shared_mapbox_token()` SECURITY
 *     DEFINER function using the (already configured) anon key — no service
 *     role key required. That function returns only the public `pk.` token.
 *
 * The token is never hardcoded in a committed file (avoids secret-scanning)
 * and stays in sync with what the user configured in the app.
 */
export async function GET() {
  let token = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''

  if (!token) {
    try {
      const sb = createSupabaseClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
        { auth: { autoRefreshToken: false, persistSession: false } },
      )
      const { data } = await sb.rpc('shared_mapbox_token')
      if (typeof data === 'string') token = data
    } catch {
      // Fall through with empty token; the page falls back to the SVG map.
    }
  }

  return NextResponse.json(
    { token },
    { headers: { 'Cache-Control': 'public, max-age=120' } },
  )
}
