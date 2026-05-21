import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const AUTH_PATHS = ['/login', '/register']

/**
 * Refreshes the Supabase session cookie on every request and guards
 * access: unauthenticated users are sent to /login, authenticated users
 * are kept out of the auth pages. API routes handle their own auth.
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          )
        },
      },
    },
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname

  // API routes enforce auth themselves; just keep the cookie fresh.
  if (path.startsWith('/api')) {
    return supabaseResponse
  }

  const isAuthPath = AUTH_PATHS.includes(path)

  const redirect = (pathname: string) => {
    const url = request.nextUrl.clone()
    url.pathname = pathname
    const res = NextResponse.redirect(url)
    supabaseResponse.cookies.getAll().forEach((c) => res.cookies.set(c))
    return res
  }

  if (path === '/') {
    return redirect(user ? '/dashboard' : '/login')
  }
  if (!user && !isAuthPath) {
    return redirect('/login')
  }
  if (user && isAuthPath) {
    return redirect('/dashboard')
  }

  return supabaseResponse
}
