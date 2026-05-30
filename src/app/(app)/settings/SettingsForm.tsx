'use client'

import { useMemo, useState } from 'react'
import { Save, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { upsertUserSettings } from '@/lib/supabase/queries'
import { PROVIDERS } from '@/lib/ai/catalog'
import type {
  AIProvider,
  Difficulty,
  RefineTarget,
  UserSettings,
} from '@/types'

const inputClass =
  'w-full rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50'

const REFINE_TARGETS: { value: RefineTarget; label: string; hint: string }[] = [
  { value: 'enigmes', label: 'Énigmes', hint: 'vérifie que le chiffrement donne la bonne réponse' },
  { value: 'coherence', label: 'Cohérence', hint: 'lieux réels, GPS plausibles, itinéraire marchable' },
  { value: 'prose', label: 'Prose globale', hint: 'récrit prologue/épilogue/contexte uniquement (~1c)' },
]

const DIFFICULTIES: Difficulty[] = ['facile', 'moyen', 'difficile', 'boss']

function toggle<T>(list: T[], value: T): T[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value]
}

export function SettingsForm({
  userId,
  initial,
}: {
  userId: string
  initial: UserSettings | null
}) {
  const [provider, setProvider] = useState<AIProvider>(
    initial?.ai_provider ?? 'anthropic',
  )
  const [model, setModel] = useState<string>(
    initial?.ai_model ?? PROVIDERS.anthropic.models[0].value,
  )
  const [apiKey, setApiKey] = useState<string>(initial?.ai_api_key ?? '')
  const [mapboxToken, setMapboxToken] = useState<string>(
    initial?.mapbox_token ?? '',
  )
  const [showApiKey, setShowApiKey] = useState(false)
  const [showMapbox, setShowMapbox] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const initRefine = initial?.generation_pipeline?.refine
  const [refineEnabled, setRefineEnabled] = useState(initRefine?.enabled ?? false)
  const [refineProvider, setRefineProvider] = useState<AIProvider>(
    initRefine?.provider ?? 'anthropic',
  )
  const [refineModel, setRefineModel] = useState<string>(
    initRefine?.model ?? PROVIDERS.anthropic.models[0].value,
  )
  const [refineApiKey, setRefineApiKey] = useState<string>(
    initRefine?.apiKey ?? '',
  )
  const [refineTargets, setRefineTargets] = useState<RefineTarget[]>(
    initRefine?.targets ?? ['enigmes', 'coherence'],
  )
  const [refineDifficulties, setRefineDifficulties] = useState<Difficulty[]>(
    initRefine?.difficulties ?? ['difficile', 'boss'],
  )
  const [showRefineKey, setShowRefineKey] = useState(false)

  const initQuiz = initial?.generation_pipeline?.quiz
  const [quizEnabled, setQuizEnabled] = useState(initQuiz?.enabled ?? true)
  const [quizProvider, setQuizProvider] = useState<AIProvider>(
    initQuiz?.provider ?? 'nvidia',
  )
  const [quizModel, setQuizModel] = useState<string>(
    initQuiz?.model ?? PROVIDERS.nvidia.models[0].value,
  )
  const [quizApiKey, setQuizApiKey] = useState<string>(initQuiz?.apiKey ?? '')
  const [showQuizKey, setShowQuizKey] = useState(false)

  const models = useMemo(() => PROVIDERS[provider].models, [provider])
  const refineModels = useMemo(
    () => PROVIDERS[refineProvider].models,
    [refineProvider],
  )
  const quizModels = useMemo(
    () => PROVIDERS[quizProvider].models,
    [quizProvider],
  )

  function handleRefineProviderChange(next: AIProvider) {
    setRefineProvider(next)
    if (!PROVIDERS[next].models.some((m) => m.value === refineModel)) {
      setRefineModel(PROVIDERS[next].models[0].value)
    }
    setSaved(false)
  }

  function handleQuizProviderChange(next: AIProvider) {
    setQuizProvider(next)
    if (!PROVIDERS[next].models.some((m) => m.value === quizModel)) {
      setQuizModel(PROVIDERS[next].models[0].value)
    }
    setSaved(false)
  }

  function markDirty() {
    setSaved(false)
  }

  function handleProviderChange(next: AIProvider) {
    setProvider(next)
    // Reset model to the first one supported by the new provider.
    if (!PROVIDERS[next].models.some((m) => m.value === model)) {
      setModel(PROVIDERS[next].models[0].value)
    }
    setSaved(false)
  }

  async function handleSave() {
    setError(null)
    setSaved(false)
    setSaving(true)
    try {
      await upsertUserSettings(createClient(), {
        user_id: userId,
        ai_provider: provider,
        ai_model: model,
        ai_api_key: apiKey.trim() || null,
        mapbox_token: mapboxToken.trim() || null,
        generation_pipeline: {
          refine: {
            enabled: refineEnabled,
            provider: refineProvider,
            model: refineModel,
            apiKey: refineApiKey.trim() || null,
            targets: refineTargets,
            difficulties: refineDifficulties,
          },
          quiz: {
            enabled: quizEnabled,
            provider: quizProvider,
            model: quizModel,
            apiKey: quizApiKey.trim() || null,
          },
        },
      })
      setSaved(true)
    } catch {
      setError('Impossible de sauvegarder. Réessaie.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-6 rounded-2xl border border-amber-200/15 bg-black/30 p-6">
      <section className="space-y-3">
        <h2 className="text-sm font-semibold text-amber-100">
          Génération de balades (IA)
        </h2>
        <p className="text-[11px] text-amber-100/40">
          Modèle principal qui rédige le brouillon complet. Pour réduire les
          coûts, choisis ici un modèle économique (Groq, NVIDIA…) et active la
          vérification ci-dessous avec un modèle plus fort.
        </p>

        <div>
          <label className="mb-1 block text-xs text-amber-100/50">
            Fournisseur
          </label>
          <select
            value={provider}
            onChange={(e) => handleProviderChange(e.target.value as AIProvider)}
            className={inputClass}
          >
            {Object.entries(PROVIDERS).map(([key, info]) => (
              <option key={key} value={key}>
                {info.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-amber-100/50">
            Modèle
          </label>
          <select
            value={model}
            onChange={(e) => {
              setModel(e.target.value)
              setSaved(false)
            }}
            className={inputClass}
          >
            {models.map((m) => (
              <option key={m.value} value={m.value}>
                {m.label}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-xs text-amber-100/50">
            Clé API ({PROVIDERS[provider].label})
          </label>
          <div className="relative">
            <input
              type={showApiKey ? 'text' : 'password'}
              value={apiKey}
              onChange={(e) => {
                setApiKey(e.target.value)
                setSaved(false)
              }}
              placeholder="sk-…"
              className={`${inputClass} pr-10`}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={() => setShowApiKey((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-amber-100/50 transition hover:text-amber-100"
              aria-label={showApiKey ? 'Masquer' : 'Afficher'}
            >
              {showApiKey ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-amber-100/35">
            {provider === 'anthropic' &&
              'console.anthropic.com → Settings → API Keys'}
            {provider === 'openai' &&
              'platform.openai.com → API keys'}
            {provider === 'nvidia' &&
              'build.nvidia.com → Generate API Key (gratuit)'}
            {provider === 'groq' && 'console.groq.com → API Keys (gratuit)'}
            {provider === 'google' && 'aistudio.google.com → API keys'}
          </p>
        </div>
      </section>

      <section className="space-y-3 border-t border-amber-200/10 pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-100">
            Questionnaire d’affinage{' '}
            <span className="font-normal text-amber-100/40">
              (avant génération)
            </span>
          </h2>
          <button
            type="button"
            role="switch"
            aria-checked={quizEnabled}
            onClick={() => {
              setQuizEnabled((v) => !v)
              markDirty()
            }}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              quizEnabled ? 'bg-amber-300' : 'bg-amber-100/15'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-black transition ${
                quizEnabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
        <p className="text-[11px] text-amber-100/40">
          Génère 4-6 questions adaptées à la ville pour mieux orienter la
          balade. À configurer indépendamment du modèle de brouillon.
        </p>

        {quizEnabled && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-amber-100/50">
                  Fournisseur
                </label>
                <select
                  value={quizProvider}
                  onChange={(e) =>
                    handleQuizProviderChange(e.target.value as AIProvider)
                  }
                  className={inputClass}
                >
                  {Object.entries(PROVIDERS).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-amber-100/50">
                  Modèle
                </label>
                <select
                  value={quizModel}
                  onChange={(e) => {
                    setQuizModel(e.target.value)
                    markDirty()
                  }}
                  className={inputClass}
                >
                  {quizModels.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-amber-100/50">
                Clé API ({PROVIDERS[quizProvider].label})
              </label>
              <div className="relative">
                <input
                  type={showQuizKey ? 'text' : 'password'}
                  value={quizApiKey}
                  onChange={(e) => {
                    setQuizApiKey(e.target.value)
                    markDirty()
                  }}
                  placeholder="sk-…"
                  className={`${inputClass} pr-10`}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowQuizKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-amber-100/50 transition hover:text-amber-100"
                  aria-label={showQuizKey ? 'Masquer' : 'Afficher'}
                >
                  {showQuizKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <p className="mt-1 text-[11px] text-amber-100/35">
                Laisser vide pour réutiliser la clé du brouillon (uniquement
                si même fournisseur).
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-amber-200/10 pt-5">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-amber-100">
            Vérification par un 2ᵉ modèle{' '}
            <span className="font-normal text-amber-100/40">
              (qualité, coût maîtrisé)
            </span>
          </h2>
          <button
            type="button"
            role="switch"
            aria-checked={refineEnabled}
            onClick={() => {
              setRefineEnabled((v) => !v)
              markDirty()
            }}
            className={`relative h-6 w-11 shrink-0 rounded-full transition ${
              refineEnabled ? 'bg-amber-300' : 'bg-amber-100/15'
            }`}
          >
            <span
              className={`absolute top-0.5 h-5 w-5 rounded-full bg-black transition ${
                refineEnabled ? 'left-[22px]' : 'left-0.5'
              }`}
            />
          </button>
        </div>
        <p className="text-[11px] text-amber-100/40">
          Après le brouillon, ce modèle relit uniquement les parties cochées et
          ne renvoie que les corrections — sa sortie reste minuscule, donc le
          surcoût est faible.
        </p>

        {refineEnabled && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <label className="mb-1 block text-xs text-amber-100/50">
                  Fournisseur
                </label>
                <select
                  value={refineProvider}
                  onChange={(e) =>
                    handleRefineProviderChange(e.target.value as AIProvider)
                  }
                  className={inputClass}
                >
                  {Object.entries(PROVIDERS).map(([key, info]) => (
                    <option key={key} value={key}>
                      {info.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1">
                <label className="mb-1 block text-xs text-amber-100/50">
                  Modèle
                </label>
                <select
                  value={refineModel}
                  onChange={(e) => {
                    setRefineModel(e.target.value)
                    markDirty()
                  }}
                  className={inputClass}
                >
                  {refineModels.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-amber-100/50">
                Clé API ({PROVIDERS[refineProvider].label})
              </label>
              <div className="relative">
                <input
                  type={showRefineKey ? 'text' : 'password'}
                  value={refineApiKey}
                  onChange={(e) => {
                    setRefineApiKey(e.target.value)
                    markDirty()
                  }}
                  placeholder="sk-…"
                  className={`${inputClass} pr-10`}
                  autoComplete="off"
                  spellCheck={false}
                />
                <button
                  type="button"
                  onClick={() => setShowRefineKey((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-amber-100/50 transition hover:text-amber-100"
                  aria-label={showRefineKey ? 'Masquer' : 'Afficher'}
                >
                  {showRefineKey ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-amber-100/50">
                Parties à revérifier
              </label>
              <div className="space-y-1.5">
                {REFINE_TARGETS.map((t) => (
                  <label
                    key={t.value}
                    className="flex cursor-pointer items-start gap-2 text-sm text-amber-100/80"
                  >
                    <input
                      type="checkbox"
                      checked={refineTargets.includes(t.value)}
                      onChange={() => {
                        setRefineTargets((prev) => toggle(prev, t.value))
                        markDirty()
                      }}
                      className="mt-0.5 accent-amber-300"
                    />
                    <span>
                      {t.label}
                      <span className="text-[11px] text-amber-100/35">
                        {' '}
                        — {t.hint}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs text-amber-100/50">
                Difficultés concernées
              </label>
              <div className="flex flex-wrap gap-2">
                {DIFFICULTIES.map((d) => {
                  const active = refineDifficulties.includes(d)
                  return (
                    <button
                      key={d}
                      type="button"
                      onClick={() => {
                        setRefineDifficulties((prev) => toggle(prev, d))
                        markDirty()
                      }}
                      className={`rounded-full border px-3 py-1 text-xs capitalize transition ${
                        active
                          ? 'border-amber-300/60 bg-amber-300/15 text-amber-100'
                          : 'border-amber-200/15 text-amber-100/50'
                      }`}
                    >
                      {d}
                    </button>
                  )
                })}
              </div>
            </div>
          </div>
        )}
      </section>

      <section className="space-y-3 border-t border-amber-200/10 pt-5">
        <h2 className="text-sm font-semibold text-amber-100">
          Token Mapbox{' '}
          <span className="font-normal text-amber-100/40">(optionnel)</span>
        </h2>
        <div>
          <label className="mb-1 block text-xs text-amber-100/50">
            Token Mapbox public
          </label>
          <div className="relative">
            <input
              type={showMapbox ? 'text' : 'password'}
              value={mapboxToken}
              onChange={(e) => {
                setMapboxToken(e.target.value)
                setSaved(false)
              }}
              placeholder="pk.…"
              className={`${inputClass} pr-10`}
              autoComplete="off"
              spellCheck={false}
            />
            <button
              onClick={() => setShowMapbox((v) => !v)}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-amber-100/50 transition hover:text-amber-100"
              aria-label={showMapbox ? 'Masquer' : 'Afficher'}
            >
              {showMapbox ? <EyeOff size={15} /> : <Eye size={15} />}
            </button>
          </div>
          <p className="mt-1 text-[11px] text-amber-100/35">
            Optionnel. La carte fonctionne sans token (tuiles CARTO). Avec un
            token, elle utilise le rendu Mapbox + l&apos;aperçu de validation.
          </p>
        </div>
      </section>

      {error && <p className="text-sm text-rose-300/90">{error}</p>}
      {saved && (
        <p className="text-sm text-emerald-300/90">Réglages sauvegardés.</p>
      )}

      <button
        onClick={handleSave}
        disabled={saving}
        className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-amber-300 py-2.5 text-sm font-medium text-amber-950 transition hover:bg-amber-200 disabled:opacity-50"
      >
        <Save size={15} />
        {saving ? 'Sauvegarde…' : 'Sauvegarder'}
      </button>
    </div>
  )
}
