'use client'

import { useMemo, useState } from 'react'
import { Save, Eye, EyeOff } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { upsertUserSettings } from '@/lib/supabase/queries'
import { PROVIDERS } from '@/lib/ai/catalog'
import type { AIProvider, UserSettings } from '@/types'

const inputClass =
  'w-full rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50'

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

  const models = useMemo(() => PROVIDERS[provider].models, [provider])

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
          </p>
        </div>
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
            Utilisé uniquement pour l&apos;aperçu statique de validation. La
            carte principale fonctionne sans token (tuiles OpenFreeMap).
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
