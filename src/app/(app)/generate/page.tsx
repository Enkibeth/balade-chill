'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Check } from 'lucide-react'
import type {
  Difficulty,
  GenerationRequest,
  QuizAnswer,
  QuizQuestion,
} from '@/types'

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
  const [specialInstructions, setSpecialInstructions] = useState('')
  const [loopAddress, setLoopAddress] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizError, setQuizError] = useState<string | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({})

  useEffect(() => {
    if (step !== 3 || quiz || quizLoading || quizError) return
    let cancelled = false
    setQuizLoading(true)
    fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        city: city.trim(),
        country: country.trim(),
        difficulty,
        duration_target_min: duration,
        nb_etapes: nbEtapes,
        theme_preference: theme.trim() || undefined,
      }),
    })
      .then(async (res) => {
        const data = await res.json().catch(() => null)
        if (cancelled) return
        if (data?.disabled) {
          setQuizError('Questionnaire désactivé dans les réglages.')
        } else if (!res.ok || !data?.questions) {
          setQuizError(data?.error ?? 'Quiz indisponible.')
        } else {
          setQuiz(data.questions as QuizQuestion[])
        }
      })
      .catch(() => {
        if (!cancelled) setQuizError('Quiz indisponible.')
      })
      .finally(() => {
        if (!cancelled) setQuizLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [
    step,
    quiz,
    quizLoading,
    quizError,
    city,
    country,
    difficulty,
    duration,
    nbEtapes,
    theme,
  ])

  function toggleSpecialty(s: string) {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  async function handleGenerate() {
    setError(null)
    setLoading(true)
    const quiz_answers: QuizAnswer[] = quiz
      ? quiz
          .map((q) => {
            const chosen = q.options.find(
              (o) => o.id === quizAnswers[q.id],
            )
            return chosen
              ? { question_label: q.label, option_label: chosen.label }
              : null
          })
          .filter((x): x is QuizAnswer => x !== null)
      : []
    const payload: GenerationRequest = {
      city: city.trim(),
      country: country.trim(),
      difficulty,
      duration_target_min: duration,
      medical_specialties: specialties,
      nb_etapes: nbEtapes,
      theme_preference: theme.trim() || undefined,
      special_instructions: specialInstructions.trim() || undefined,
      loop_address: loopAddress.trim() || undefined,
      quiz_answers: quiz_answers.length ? quiz_answers : undefined,
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
      <p className="mb-6 text-sm text-amber-100/45">Étape {step} sur 4</p>

      <div className="mb-6 flex gap-2">
        {[1, 2, 3, 4].map((s) => (
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
            <div>
              <label className="mb-1 block text-xs text-amber-100/50">
                Adresse de départ/arrivée{' '}
                <span className="text-amber-100/25">(optionnel)</span>
              </label>
              <input
                value={loopAddress}
                onChange={(e) => setLoopAddress(e.target.value)}
                placeholder="2bis rue Henri Dunant, Paris"
                className={inputClass}
              />
              <p className="mt-1 text-[11px] text-amber-100/35">
                Si renseignée, l&apos;étape 1 et la dernière étape seront
                forcées à cette adresse (boucle).
              </p>
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
            <div>
              <label className="mb-1 block text-xs text-amber-100/50">
                Instructions spéciales{' '}
                <span className="text-amber-100/25">(optionnel)</span>
              </label>
              <textarea
                value={specialInstructions}
                onChange={(e) => setSpecialInstructions(e.target.value)}
                placeholder="Ex : uniquement les 5e et 6e arrondissements, éviter les rues passantes, démarrer près du métro…"
                rows={3}
                className={inputClass + ' resize-none'}
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-4">
            <div>
              <h2 className="text-lg text-amber-100">Affinage</h2>
              <p className="text-xs text-amber-100/40">
                Quelques questions adaptées à {city || 'ta ville'} pour mieux
                orienter la balade. Tu peux laisser des réponses vides.
              </p>
            </div>

            {quizLoading && (
              <div className="flex items-center gap-3 rounded-lg border border-amber-200/15 bg-black/30 p-4 text-sm text-amber-100/70">
                <Loader2 size={16} className="animate-spin text-amber-300" />
                Préparation du questionnaire…
              </div>
            )}

            {quizError && !quizLoading && (
              <div className="rounded-lg border border-amber-200/15 bg-black/30 p-3 text-xs text-amber-100/60">
                {quizError} Tu peux continuer sans répondre.
              </div>
            )}

            {quiz && !quizLoading && (
              <div className="space-y-4">
                {quiz.map((q) => (
                  <div key={q.id} className="space-y-2">
                    <p className="text-sm text-amber-100">{q.label}</p>
                    <div className="flex flex-wrap gap-2">
                      {q.options.map((o) => {
                        const active = quizAnswers[q.id] === o.id
                        return (
                          <button
                            key={o.id}
                            type="button"
                            onClick={() =>
                              setQuizAnswers((prev) => ({
                                ...prev,
                                [q.id]: active ? '' : o.id,
                              }))
                            }
                            className={`rounded-full border px-3 py-1.5 text-xs transition ${
                              active
                                ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                                : 'border-amber-200/15 text-amber-100/55 hover:border-amber-200/35'
                            }`}
                          >
                            {o.label}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {step === 4 && loading && <GenerationProgress />}

        {step === 4 && !loading && (
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
              {specialInstructions && (
                <Row label="Instructions" value={specialInstructions} />
              )}
              {loopAddress && <Row label="Boucle" value={loopAddress} />}
              {quiz && Object.values(quizAnswers).filter(Boolean).length > 0 && (
                <Row
                  label="Affinage"
                  value={`${
                    Object.values(quizAnswers).filter(Boolean).length
                  } réponse(s)`}
                />
              )}
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
          {step < 4 && (
            <button
              onClick={() => setStep(step + 1)}
              disabled={step === 1 && !city.trim()}
              className="ml-auto rounded-lg bg-amber-300 px-5 py-2 text-sm font-medium text-amber-950 transition hover:bg-amber-200 disabled:opacity-40"
            >
              Continuer
            </button>
          )}
          {step === 4 && (
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

const GEN_STAGES = [
  { at: 0, label: 'Analyse de la ville et repérage des lieux' },
  { at: 8, label: 'Conception de l’itinéraire et des étapes' },
  { at: 20, label: 'Écriture du récit et des énigmes' },
  { at: 38, label: 'Vérification et finalisation' },
]

function GenerationProgress() {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const activeIndex = GEN_STAGES.reduce(
    (acc, s, i) => (elapsed >= s.at ? i : acc),
    0,
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg text-amber-100">Génération en cours…</h2>
        <span className="font-mono text-sm text-amber-100/40">{elapsed}s</span>
      </div>
      <ul className="space-y-2.5">
        {GEN_STAGES.map((s, i) => {
          const done = i < activeIndex
          const active = i === activeIndex
          return (
            <li key={s.label} className="flex items-center gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {done ? (
                  <Check size={16} className="text-emerald-400" />
                ) : active ? (
                  <Loader2 size={16} className="animate-spin text-amber-300" />
                ) : (
                  <span className="h-2 w-2 rounded-full bg-amber-200/20" />
                )}
              </span>
              <span
                className={
                  done
                    ? 'text-amber-100/45'
                    : active
                      ? 'text-amber-100'
                      : 'text-amber-100/30'
                }
              >
                {s.label}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-amber-100/35">
        Durée estimée 30-90 s selon le modèle. Ne ferme pas cette page.
      </p>
    </div>
  )
}
