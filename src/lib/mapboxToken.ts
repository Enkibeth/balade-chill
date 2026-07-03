import { createClient as createSupabaseClient } from '@supabase/supabase-js'

/**
 * Resolves the shared public Mapbox token (pk.*) server-side.
 *
 * Source order:
 *  1. NEXT_PUBLIC_MAPBOX_TOKEN (env var, if configured on the host)
 *  2. the saved user setting, read via the `shared_mapbox_token()` SECURITY
 *     DEFINER function using the (already configured) anon key — no service
 *     role key required. That function returns only the public `pk.` token.
 *
 * Returns '' when no token is available — callers must degrade gracefully.
 */
export async function getSharedMapboxToken(): Promise<string> {
  const envToken = process.env.NEXT_PUBLIC_MAPBOX_TOKEN ?? ''
  if (envToken) return envToken
  try {
    const sb = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } },
    )
    const { data } = await sb.rpc('shared_mapbox_token')
    return typeof data === 'string' ? data : ''
  } catch {
    return ''
  }
}
