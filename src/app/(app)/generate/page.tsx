'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Difficulty, GenerationRequest } from '@/types'

const DIFFICULTIES: { value: Difficulty; label: string; desc: string }[] = [
  { value: 'facile', label: 'Facile', desc: 'Jeux de mots, sans chiffrement' },
  { value: 'moyen', label: 'Moyen', desc: 'César ou code mathématique' },
  { value: 'difficile', label: 'Difficile', desc: 'Polybe, alphabet inversé' },
  { value: 'boss', label: 'Boss', desc: 'Chiffrements combinés multi-étapes' },
]

const SPECIALTIES = [
  'cardiologie',
  'neurologie',
  'urgences',
  'pneumologie',
  'gastro',
]

const inputClass =
  'w-full rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50'

export default function GeneratePage() {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('France')
  const [duration, setDuration] = useState(120)
  const [nbEtapes, setNbEtapes] = useState(5)
  const [difficulty, setDifficulty] = useState<Difficulty>('difficile')
  const [specialties, setSpecialties] = useState<string[]>([
    'cardiologie',
    'neurologie',
  ])
  const [theme, setTheme] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function toggleSpecialty(s: string) {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  async function handleGenerate() {
    setError(null)
    setLoading(true)
    const payload: GenerationRequest = {
      city: city.trim(),
      country: country.trim(),
      difficulty,
      duration_target_min: duration,
      medical_specialties: specialties,
      nb_etapes: nbEtapes,
      theme_preference: theme.trim() || undefined,
    }
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.error ?? 'La génération a échoué.')
        setLoading(false)
        return
      }
      router.push(`/balade/${data.balade_id}?mode=preview`)
    } catch {
      setError('Erreur réseau. Vérifie ta connexion.')
      setLoading(false)
    }
  }

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 font-mono text-xl tracking-[0.2em] text-amber-200">
        NOUVELLE BALADE
      </h1>
      <p className="mb-6 text-sm text-amber-100/45">Étape {step} sur 3</p>

      <div className="mb-6 flex gap-2">
        {[1, 2, 3].map((s) => (
          <div
            key={s}
            className={`h-1 flex-1 rounded-full ${
              s <= step ? 'bg-amber-300' : 'bg-amber-200/15'
            }`}
          />
        ))}
      </div>

      <div className="rounded-2xl border border-amber-200/15 bg-black/30 p-6">
        {step === 1 && (
          <div className="space-y-4">
            <h2 className="text-lg text-amber-100">Destination</h2>
            <div>
              <label className="mb-1 block text-xs text-amber-100/50">
                Ville
              </label>
              <input
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="Paris"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-amber-100/50">
                Pays
              </label>
              <input
                value={country}
                onChange={(e) => setCountry(e.target.value)}
                placeholder="France"
                className={inputClass}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-amber-100/50">
                Durée souhaitée : {duration} min
              </label>
              <input
                type="range"
                min={45}
                max={240}
                step={15}
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                className="w-full accent-amber-300"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs text-amber-100/50">
                Nombre d&apos;étapes : {nbEtapes}
              </label>
              <input
                type="range"
                min={3}
                max={6}
                step={1}
                value={nbEtapes}
                onChange={(e) => setNbEtapes(Number(e.target.value))}
                className="w-full accent-amber-300"
              />
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <h2 className="text-lg text-amber-100">Personnalisation</h2>
            <div>
              <label className="mb-2 block text-xs text-amber-100/50">
                Difficulté
              </label>
              <div className="space-y-2">
                {DIFFICULTIES.map((d) => (
                  <button
                    key={d.value}
                    onClick={() => setDifficulty(d.value)}
                    className={`w-full rounded-lg border px-3 py-2 text-left transition ${
                      difficulty === d.value
                        ? 'border-amber-300/60 bg-amber-300/10'
                        : 'border-amber-200/15 hover:border-amber-200/30'
                    }`}
                  >
                    <span className="text-sm text-amber-100">{d.label}</span>
                    <span className="ml-2 text-xs text-amber-100/40">
                      {d.desc}
                    </span>
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-2 block text-xs text-amber-100/50">
                Spécialités médicales
              </label>
              <div className="flex flex-wrap gap-2">
                {SPECIALTIES.map((s) => (
                  <button
                    key={s}
                    onClick={() => toggleSpecialty(s)}
                    className={`rounded-full border px-3 py-1.5 text-xs capitalize transition ${
                      specialties.includes(s)
                        ? 'border-teal-400/50 bg-teal-400/15 text-teal-200'
                        : 'border-amber-200/15 text-amber-100/45'
                    }`}
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="mb-1 block text-xs text-amber-100/50">
                Préférence de thème{' '}
                <span className="text-amber-100/25">(optionnel)</span>
              </label>
              <input
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                placeholder="Ambiance Belle Époque, ruelles secrètes…"
                className={inputClass}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <h2 className="text-lg text-amber-100">Confirmation</h2>
            <dl className="space-y-2 text-sm">
              <Row label="Destination" value={`${city || '—'}, ${country}`} />
              <Row label="Durée" value={`~${duration} min`} />
              <Row label="Étapes" value={String(nbEtapes)} />
              <Row
                label="Difficulté"
                value={
                  DIFFICULTIES.find((d) => d.value === difficulty)?.label ?? ''
                }
              />
              <Row
                label="Médecine"
                value={specialties.join(', ') || 'cardiologie, neurologie'}
              />
              {theme && <Row label="Thème" value={theme} />}
            </dl>
            <p className="pt-2 text-xs text-amber-100/40">
              La génération prend environ 30 secondes.
            </p>
          </div>
        )}

        {error && <p className="mt-4 text-sm text-rose-300/90">{error}</p>}

        <div className="mt-6 flex gap-3">
          {step > 1 && (
            <button
              onClick={() => setStep(step - 1)}
              disabled={loading}
              className="rounded-lg border border-amber-200/20 px-4 py-2 text-sm text-amber-100/70 transition hover:border-amber-200/40 disabled:opacity-40"
            >
              Retour
            </button>
          )}
          {step < 3 && (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !city.trim()}
              className="ml-auto rounded-lg bg-amber-300 px-5 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-200 disabled:opacity-40"
            >
              Continuer
            </button>
          )}
          {step === 3 && (
            <button
              onClick={handleGenerate}
              disabled={loading || !city.trim()}
              className="ml-auto rounded-lg bg-amber-300 px-5 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-200 disabled:opacity-50"
            >
              {loading ? 'Génération en cours…' : 'Générer la balade'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-amber-200/10 pb-2">
      <dt className="text-amber-100/45">{label}</dt>
      <dd className="text-right text-amber-100">{value}</dd>
    </div>
  )
}
