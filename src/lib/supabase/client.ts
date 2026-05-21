import { createBrowserClient } from '@supabase/ssr'

/** Browser-side Supabase client (SSR-safe, reads the public anon key). */
export function createClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )
}
