'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleLogin() {
    setError(null)
    if (!email || !password) {
      setError('Renseigne ton email et ton mot de passe.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    })
    if (signInError) {
      setError('Identifiants incorrects.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-amber-200/15 bg-black/30 p-6 backdrop-blur">
      <h2 className="mb-5 text-lg text-amber-100">Connexion</h2>

      <label className="mb-1 block text-xs text-amber-100/50">Email</label>
      <input
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className="mb-4 w-full rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50"
        placeholder="hugo@exemple.fr"
      />

      <label className="mb-1 block text-xs text-amber-100/50">
        Mot de passe
      </label>
      <input
        type="password"
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        className="mb-5 w-full rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50"
        placeholder="••••••••"
      />

      {error && (
        <p className="mb-4 text-sm text-rose-300/90">{error}</p>
      )}

      <button
        onClick={handleLogin}
        disabled={loading}
        className="w-full rounded-lg bg-amber-300 py-2.5 text-sm font-medium text-amber-950 transition hover:bg-amber-200 disabled:opacity-50"
      >
        {loading ? 'Connexion…' : 'Se connecter'}
      </button>

      <p className="mt-5 text-center text-xs text-amber-100/50">
        Pas encore de compte ?{' '}
        <Link href="/register" className="text-amber-300 hover:underline">
          Créer un compte
        </Link>
      </p>
    </div>
  )
}
