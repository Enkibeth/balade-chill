'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'

export default function RegisterPage() {
  const router = useRouter()
  const [displayName, setDisplayName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [partnerEmail, setPartnerEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleRegister() {
    setError(null)
    setNotice(null)
    if (!displayName || !email || !password) {
      setError('Renseigne ton prénom, ton email et un mot de passe.')
      return
    }
    if (password.length < 6) {
      setError('Le mot de passe doit faire au moins 6 caractères.')
      return
    }
    setLoading(true)
    const supabase = createClient()
    const { data, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          display_name: displayName,
          // Resolved bidirectionally by the DB trigger on signup.
          pending_partner_email: partnerEmail.trim() || null,
        },
      },
    })
    if (signUpError) {
      setError(signUpError.message)
      setLoading(false)
      return
    }
    if (!data.session) {
      // Email confirmation is enabled on the Supabase project.
      setNotice('Compte créé. Vérifie ton email pour confirmer, puis connecte-toi.')
      setLoading(false)
      return
    }
    router.push('/dashboard')
    router.refresh()
  }

  return (
    <div className="rounded-2xl border border-amber-200/15 bg-black/30 p-6 backdrop-blur">
      <h2 className="mb-5 text-lg text-amber-100">Créer un compte</h2>

      <label className="mb-1 block text-xs text-amber-100/50">Prénom</label>
      <input
        type="text"
        value={displayName}
        onChange={(e) => setDisplayName(e.target.value)}
        className="mb-4 w-full rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50"
        placeholder="Hugo"
      />

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
        className="mb-4 w-full rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50"
        placeholder="••••••••"
      />

      <label className="mb-1 block text-xs text-amber-100/50">
        Email du partenaire{' '}
        <span className="text-amber-100/30">(optionnel)</span>
      </label>
      <input
        type="email"
        value={partnerEmail}
        onChange={(e) => setPartnerEmail(e.target.value)}
        className="mb-5 w-full rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50"
        placeholder="eloise@exemple.fr"
      />

      {error && <p className="mb-4 text-sm text-rose-300/90">{error}</p>}
      {notice && <p className="mb-4 text-sm text-emerald-300/90">{notice}</p>}

      <button
        onClick={handleRegister}
        disabled={loading}
        className="w-full rounded-lg bg-amber-300 py-2.5 text-sm font-medium text-amber-950 transition hover:bg-amber-200 disabled:opacity-50"
      >
        {loading ? 'Création…' : 'Créer le compte'}
      </button>

      <p className="mt-5 text-center text-xs text-amber-100/50">
        Déjà un compte ?{' '}
        <Link href="/login" className="text-amber-300 hover:underline">
          Se connecter
        </Link>
      </p>
    </div>
  )
}
