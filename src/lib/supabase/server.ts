import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/** Server-side Supabase client for Server Components and Route Handlers. */
export function createClient() {
  const cookieStore = cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            )
          } catch {
            // Called from a Server Component — the middleware refreshes
            // the session cookie, so this can be safely ignored.
          }
        },
      },
    },
  )
}
