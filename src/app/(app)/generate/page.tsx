'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import { Loader2, Check } from 'lucide-react'
import { BONUS_CATEGORIES } from '@/lib/ai/bonus'
import type {
  BonusCategory,
  Difficulty,
  GenerationRequest,
  QuizAnswer,
  QuizQuestion,
} from '@/types'
import type { StartEndValue } from '@/components/map/StartEndPicker'
import {
  GENERATION_DRAFT_KEY,
  parseGenerationDraft,
  type GenerationDraft,
} from '@/lib/generationDraft'
import { createClient } from '@/lib/supabase/client'
import {
  deleteGenerationDraft,
  getGenerationDraft,
  saveGenerationDraft,
} from '@/lib/supabase/queries'

const StartEndPicker = dynamic(
  () =>
    import('@/components/map/StartEndPicker').then((m) => m.StartEndPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-amber-200/15 bg-black/30 text-xs text-amber-100/40">
        Chargement de la carte…
      </div>
    ),
  },
)

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
  const [bonusThemes, setBonusThemes] = useState<BonusCategory[]>(['medical'])
  const [bonusCustom, setBonusCustom] = useState('')
  const [startEnd, setStartEnd] = useState<StartEndValue>({
    start: null,
    end: null,
    loop: true,
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // Real pipeline stages streamed by /api/generate (NDJSON), in arrival order.
  const [genStages, setGenStages] = useState<GenStage[]>([])
  const [quiz, setQuiz] = useState<QuizQuestion[] | null>(null)
  const [quizLoading, setQuizLoading] = useState(false)
  const [quizError, setQuizError] = useState<string | null>(null)
  const [quizAnswers, setQuizAnswers] = useState<Record<string, string>>({})
  // Tracks whether a quiz has already loaded, so re-entering step 3 (e.g. via
  // the Retour button) keeps it instead of re-fetching. A ref — not state —
  // because it must not be a dependency of the fetch effect.
  const quizLoadedRef = useRef(false)
  // Draft persistence: saves only start once the initial localStorage read is
  // done, otherwise the pristine first render would overwrite an existing
  // draft before it gets restored.
  const draftReadyRef = useRef(false)
  // Set on successful generation: the draft was just purged and must not be
  // recreated by a late autosave while navigating away.
  const draftDoneRef = useRef(false)
  // Filled once on mount from the local session; remote draft sync is simply
  // skipped when it stays null (session expirée, hors-ligne…).
  const userIdRef = useRef<string | null>(null)
  const [draftRestoredAt, setDraftRestoredAt] = useState<number | null>(null)

  // Restore a pending draft on mount, from the freshest of the two copies:
  // localStorage (survives offline) and Supabase (survives across devices).
  // localStorage does not exist during SSR, so this runs in an effect.
  useEffect(() => {
    let cancelled = false
    async function restoreDraft() {
      let local: GenerationDraft | null = null
      try {
        local = parseGenerationDraft(
          localStorage.getItem(GENERATION_DRAFT_KEY),
        )
      } catch {
        // localStorage indisponible (navigation privée…) — pas de copie locale.
      }
      let remote: GenerationDraft | null = null
      try {
        const supabase = createClient()
        const { data } = await supabase.auth.getSession()
        const userId = data.session?.user.id ?? null
        userIdRef.current = userId
        if (userId) {
          // Ne bloque pas le formulaire plus de 2,5 s sur un réseau lent : au
          // pire la copie locale (ou rien) est restaurée.
          remote = await withTimeout(
            getGenerationDraft(supabase, userId),
            2500,
            null,
          )
        }
      } catch {
        // hors-ligne — la copie locale suffira
      }
      if (cancelled) return
      const draft =
        remote && (!local || remote.savedAt > local.savedAt) ? remote : local
      if (draft) {
        setStep(draft.step)
        setCity(draft.city)
        setCountry(draft.country)
        setDuration(draft.duration)
        setNbEtapes(draft.nbEtapes)
        setDifficulty(draft.difficulty)
        setSpecialties(draft.specialties)
        setTheme(draft.theme)
        setSpecialInstructions(draft.specialInstructions)
        setBonusThemes(draft.bonusThemes)
        setBonusCustom(draft.bonusCustom)
        setStartEnd(draft.startEnd)
        if (draft.quiz) {
          quizLoadedRef.current = true
          setQuiz(draft.quiz)
          setQuizAnswers(draft.quizAnswers)
        }
        setDraftRestoredAt(draft.savedAt)
      }
      draftReadyRef.current = true
    }
    restoreDraft()
    return () => {
      cancelled = true
    }
  }, [])

  // Autosave the draft (debounced) on every form change, so a crash or a
  // failed generation never loses the user's instructions: localStorage
  // right away (works offline), Supabase a bit later (syncs across devices).
  // A form back at its pristine state deletes the draft instead.
  useEffect(() => {
    if (!draftReadyRef.current || draftDoneRef.current) return
    const hasContent =
      step > 1 ||
      city.trim() !== '' ||
      theme.trim() !== '' ||
      specialInstructions.trim() !== '' ||
      startEnd.start !== null
    const draft: GenerationDraft = {
      savedAt: Date.now(),
      step,
      city,
      country,
      duration,
      nbEtapes,
      difficulty,
      specialties,
      theme,
      specialInstructions,
      bonusThemes,
      bonusCustom,
      startEnd,
      quiz,
      quizAnswers,
    }
    const localTimer = setTimeout(() => {
      try {
        if (!hasContent) localStorage.removeItem(GENERATION_DRAFT_KEY)
        else localStorage.setItem(GENERATION_DRAFT_KEY, JSON.stringify(draft))
      } catch {
        // Quota plein ou stockage indisponible — l'app marche sans brouillon.
      }
    }, 400)
    const remoteTimer = setTimeout(() => {
      const userId = userIdRef.current
      if (!userId) return
      const supabase = createClient()
      if (!hasContent) void deleteGenerationDraft(supabase, userId)
      else void saveGenerationDraft(supabase, userId, draft)
    }, 1500)
    return () => {
      clearTimeout(localTimer)
      clearTimeout(remoteTimer)
    }
  }, [
    step,
    city,
    country,
    duration,
    nbEtapes,
    difficulty,
    specialties,
    theme,
    specialInstructions,
    bonusThemes,
    bonusCustom,
    startEnd,
    quiz,
    quizAnswers,
  ])

  function clearDraftOnSuccess() {
    draftDoneRef.current = true
    try {
      localStorage.removeItem(GENERATION_DRAFT_KEY)
    } catch {
      // stockage indisponible — rien à purger
    }
    if (userIdRef.current) {
      void deleteGenerationDraft(createClient(), userIdRef.current)
    }
  }

  function discardDraft() {
    try {
      localStorage.removeItem(GENERATION_DRAFT_KEY)
    } catch {
      // stockage indisponible — rien à purger
    }
    if (userIdRef.current) {
      void deleteGenerationDraft(createClient(), userIdRef.current)
    }
    quizLoadedRef.current = false
    setStep(1)
    setCity('')
    setCountry('France')
    setDuration(120)
    setNbEtapes(5)
    setDifficulty('difficile')
    setSpecialties(['cardiologie', 'neurologie'])
    setTheme('')
    setSpecialInstructions('')
    setBonusThemes(['medical'])
    setBonusCustom('')
    setStartEnd({ start: null, end: null, loop: true })
    setQuiz(null)
    setQuizAnswers({})
    setError(null)
    setDraftRestoredAt(null)
  }

  // Fetch the orientation quiz when the user reaches step 3. The effect must
  // depend ONLY on `step` and the balade inputs — never on the state it sets
  // (quizLoading/quizError/quiz). Including those would re-run the effect the
  // instant setQuizLoading(true) fires, whose cleanup aborts the in-flight
  // fetch and leaves the spinner stuck forever (the original "charge sans fin").
  useEffect(() => {
    if (step !== 3 || quizLoadedRef.current) return
    let cancelled = false
    // Free/slow providers can hang or rate-limit. Without a timeout the spinner
    // spins forever; abort after 45s and let the user skip the step.
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 45000)
    setQuizLoading(true)
    setQuizError(null)
    fetch('/api/generate-quiz', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
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
          quizLoadedRef.current = true
          setQuiz(data.questions as QuizQuestion[])
        }
      })
      .catch((err) => {
        if (cancelled) return
        setQuizError(
          err?.name === 'AbortError'
            ? 'Le questionnaire met trop de temps (modèle lent). Tu peux continuer sans répondre.'
            : 'Quiz indisponible.',
        )
      })
      .finally(() => {
        if (cancelled) return
        clearTimeout(timeout)
        setQuizLoading(false)
      })
    return () => {
      cancelled = true
      clearTimeout(timeout)
      controller.abort()
    }
  }, [step, city, country, difficulty, duration, nbEtapes, theme])

  function toggleSpecialty(s: string) {
    setSpecialties((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  function toggleBonusTheme(id: BonusCategory) {
    setBonusThemes((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    )
  }

  const medicalSelected = bonusThemes.includes('medical')
  const customSelected = bonusThemes.includes('custom')

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
    const endPoint = startEnd.loop ? startEnd.start : startEnd.end
    const payload: GenerationRequest = {
      city: city.trim(),
      country: country.trim(),
      difficulty,
      duration_target_min: duration,
      medical_specialties: specialties,
      nb_etapes: nbEtapes,
      theme_preference: theme.trim() || undefined,
      special_instructions: specialInstructions.trim() || undefined,
      bonus_themes: bonusThemes.length ? bonusThemes : ['medical'],
      bonus_custom_theme:
        customSelected && bonusCustom.trim() ? bonusCustom.trim() : undefined,
      start_point: startEnd.start ?? undefined,
      end_point: endPoint ?? undefined,
      quiz_answers: quiz_answers.length ? quiz_answers : undefined,
    }
    setGenStages([])
    try {
      const res = await fetch('/api/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => null)
        setError(data?.error ?? 'La génération a échoué.')
        setLoading(false)
        return
      }
      const ctype = res.headers.get('content-type') ?? ''
      if (!ctype.includes('ndjson') || !res.body) {
        // Non-streaming response — single JSON payload.
        const data = await res.json().catch(() => null)
        if (data?.balade_id) {
          clearDraftOnSuccess()
          router.push(`/balade/${data.balade_id}?mode=preview`)
        } else {
          setError(data?.error ?? 'La génération a échoué.')
          setLoading(false)
        }
        return
      }

      // Stream the real pipeline progress line by line (NDJSON).
      let terminal = false
      const handleLine = (line: string) => {
        const trimmed = line.trim()
        if (!trimmed) return
        let event: GenEvent
        try {
          event = JSON.parse(trimmed) as GenEvent
        } catch {
          return
        }
        if (event.type === 'progress' && event.stage && event.label) {
          const entry: GenStage = {
            stage: event.stage,
            label: event.label,
            current: event.current,
            total: event.total,
          }
          setGenStages((prev) => {
            const idx = prev.findIndex((s) => s.stage === entry.stage)
            if (idx === -1) return [...prev, entry]
            const clone = [...prev]
            clone[idx] = entry
            return clone
          })
        } else if (event.type === 'done' && event.balade_id) {
          terminal = true
          clearDraftOnSuccess()
          router.push(`/balade/${event.balade_id}?mode=preview`)
        } else if (event.type === 'error') {
          terminal = true
          setError(event.error ?? 'La génération a échoué.')
          setLoading(false)
        }
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''
        for (const line of lines) handleLine(line)
      }
      if (buffer) handleLine(buffer)
      if (!terminal) {
        setError(
          'Connexion interrompue pendant la génération. Vérifie dans le tableau de bord si la balade a été créée avant de relancer.',
        )
        setLoading(false)
      }
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

      {draftRestoredAt !== null && (
        <div className="mb-4 flex items-center justify-between gap-3 rounded-lg border border-teal-400/30 bg-teal-400/10 px-3 py-2">
          <p className="text-xs text-teal-100/90">
            Brouillon restauré ({formatDraftDate(draftRestoredAt)}) — tes
            réglages et instructions ont été repris.
          </p>
          <button
            onClick={discardDraft}
            className="shrink-0 rounded-md border border-teal-400/30 px-2.5 py-1 text-[11px] text-teal-100/80 transition hover:border-teal-300/60 hover:text-teal-50"
          >
            Repartir de zéro
          </button>
        </div>
      )}

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
                Point de départ et d&apos;arrivée{' '}
                <span className="text-amber-100/25">(recommandé)</span>
              </label>
              <StartEndPicker
                city={city}
                country={country}
                value={startEnd}
                onChange={setStartEnd}
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
                Questions bonus{' '}
                <span className="text-amber-100/25">(une par étape · choix multiple)</span>
              </label>
              <div className="space-y-2">
                {BONUS_CATEGORIES.map((c) => {
                  const active = bonusThemes.includes(c.id)
                  return (
                    <button
                      key={c.id}
                      onClick={() => toggleBonusTheme(c.id)}
                      className={`flex w-full items-center gap-2.5 rounded-lg border px-3 py-2 text-left transition ${
                        active
                          ? 'border-teal-400/50 bg-teal-400/10'
                          : 'border-amber-200/15 hover:border-amber-200/30'
                      }`}
                    >
                      <span aria-hidden className="text-base">
                        {c.emoji}
                      </span>
                      <span className="text-sm text-amber-100">{c.label}</span>
                      <span className="ml-auto hidden text-xs text-amber-100/40 sm:block">
                        {c.desc}
                      </span>
                    </button>
                  )
                })}
              </div>
              {bonusThemes.length === 0 && (
                <p className="mt-1.5 text-[11px] text-amber-100/40">
                  Aucun thème sélectionné — les questions médecine seront
                  utilisées par défaut.
                </p>
              )}
            </div>

            {medicalSelected && (
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
            )}

            {customSelected && (
              <div>
                <label className="mb-1 block text-xs text-amber-100/50">
                  Thème personnalisé
                </label>
                <input
                  value={bonusCustom}
                  onChange={(e) => setBonusCustom(e.target.value)}
                  placeholder="Cinéma, gastronomie, mythologie, sport…"
                  className={inputClass}
                />
              </div>
            )}
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

        {step === 4 && loading && <GenerationProgress stages={genStages} />}

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
                label="Bonus"
                value={
                  bonusThemes.length
                    ? bonusThemes
                        .map(
                          (id) =>
                            BONUS_CATEGORIES.find((c) => c.id === id)?.label ??
                            id,
                        )
                        .join(', ')
                    : 'Médecine (défaut)'
                }
              />
              {medicalSelected && (
                <Row
                  label="Spécialités"
                  value={specialties.join(', ') || 'cardiologie, neurologie'}
                />
              )}
              {customSelected && bonusCustom.trim() && (
                <Row label="Thème libre" value={bonusCustom.trim()} />
              )}
              {theme && <Row label="Thème" value={theme} />}
              {specialInstructions && (
                <Row label="Instructions" value={specialInstructions} />
              )}
              {startEnd.start && (
                <Row
                  label={startEnd.loop ? 'Départ/arrivée' : 'Départ'}
                  value={pointLabel(startEnd.start)}
                />
              )}
              {!startEnd.loop && startEnd.end && (
                <Row label="Arrivée" value={pointLabel(startEnd.end)} />
              )}
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
              La génération prend en général 1 à 3 minutes selon le modèle — tu
              suivras chaque étape en direct.
            </p>
          </div>
        )}

        {error && (
          <div className="mt-4 space-y-1">
            <p className="text-sm text-rose-300/90">{error}</p>
            <p className="text-xs text-amber-100/45">
              Tes réglages et instructions sont conservés en brouillon — tu
              peux relancer maintenant ou revenir plus tard, tout sera
              restauré.
            </p>
          </div>
        )}

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

function pointLabel(p: { lat: number; lng: number; label?: string }): string {
  return p.label?.trim() || `${p.lat.toFixed(4)}, ${p.lng.toFixed(4)}`
}

function formatDraftDate(ts: number): string {
  return new Date(ts).toLocaleString('fr-FR', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** Resolves with `fallback` if the promise takes longer than `ms`. */
function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
  ])
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4 border-b border-amber-200/10 pb-2">
      <dt className="text-amber-100/45">{label}</dt>
      <dd className="text-right text-amber-100">{value}</dd>
    </div>
  )
}

interface GenStage {
  stage: string
  label: string
  current?: number
  total?: number
}

type GenEvent = {
  type?: string
  stage?: string
  label?: string
  current?: number
  total?: number
  balade_id?: string
  error?: string
}

function GenerationProgress({ stages }: { stages: GenStage[] }) {
  const [elapsed, setElapsed] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setElapsed((s) => s + 1), 1000)
    return () => clearInterval(t)
  }, [])
  const shown: GenStage[] = stages.length
    ? stages
    : [{ stage: 'connect', label: 'Connexion au modèle…' }]

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg text-amber-100">Génération en cours…</h2>
        <span className="font-mono text-sm text-amber-100/40">{elapsed}s</span>
      </div>
      <ul className="space-y-2.5">
        {shown.map((s, i) => {
          const active = i === shown.length - 1
          const counter =
            s.total && s.total > 0 ? ` (${s.current ?? 0}/${s.total})` : ''
          return (
            <li key={s.stage} className="flex items-center gap-3 text-sm">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center">
                {active ? (
                  <Loader2 size={16} className="animate-spin text-amber-300" />
                ) : (
                  <Check size={16} className="text-emerald-400" />
                )}
              </span>
              <span className={active ? 'text-amber-100' : 'text-amber-100/45'}>
                {s.label}
                {counter}
              </span>
            </li>
          )
        })}
      </ul>
      <p className="text-xs text-amber-100/35">
        Progression réelle du pipeline — chaque étape s’affiche au moment où
        elle se produit. Ne ferme pas cette page.
      </p>
    </div>
  )
}
