'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

const LINKS = [
  { href: '/dashboard', label: 'Carte' },
  { href: '/generate', label: 'Générer' },
  { href: '/history', label: 'Historique' },
  { href: '/settings', label: 'Réglages' },
]

export function Nav() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    await createClient().auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <nav className="sticky top-0 z-40 border-b border-amber-200/10 bg-[#1a0f08]/85 backdrop-blur">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
        <Link
          href="/dashboard"
          className="font-mono text-sm tracking-[0.25em] text-amber-200"
        >
          BALADES
        </Link>
        <div className="flex items-center gap-1">
          {LINKS.map((link) => {
            const active =
              pathname === link.href || pathname.startsWith(link.href + '/')
            return (
              <Link
                key={link.href}
                href={link.href}
                className={`rounded-lg px-3 py-1.5 text-sm transition ${
                  active
                    ? 'bg-amber-300/15 text-amber-200'
                    : 'text-amber-100/55 hover:text-amber-100'
                }`}
              >
                {link.label}
              </Link>
            )
          })}
          <button
            onClick={handleLogout}
            className="ml-1 rounded-lg px-3 py-1.5 text-sm text-amber-100/40 transition hover:text-rose-300"
          >
            Quitter
          </button>
        </div>
      </div>
    </nav>
  )
}
