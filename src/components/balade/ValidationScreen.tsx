'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import dynamic from 'next/dynamic'
import {
  MapPin,
  Clock,
  AlertTriangle,
  Shuffle,
  Play,
  Pencil,
  Save,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { renderBaladeHtml } from '@/lib/claude/render-html'
import { CipherBlock } from './CipherBlock'
import type { Balade, ThemeColor } from '@/types'

const RoutePreviewMap = dynamic(
  () =>
    import('@/components/map/RoutePreviewMap').then((m) => m.RoutePreviewMap),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-amber-200/15 bg-black/30 text-xs text-amber-100/40">
        Chargement de la carte…
      </div>
    ),
  },
)

const PALETTES: ThemeColor[] = [
  { name: 'Sépia & Or', primary: '#7a1c2e', secondary: '#b8860b', accent: '#c4757a', bg: '#1a0f08' },
  { name: 'Nuit Émeraude', primary: '#1a5e4a', secondary: '#d4af37', accent: '#7ab8a0', bg: '#0c1410' },
  { name: 'Crépuscule', primary: '#5b2a86', secondary: '#e0a458', accent: '#c98bb9', bg: '#150c1a' },
  { name: 'Bleu Minuit', primary: '#1e3a5f', secondary: '#c9a14a', accent: '#6f9bc4', bg: '#0a0f18' },
  { name: 'Terre Brûlée', primary: '#9a3b1b', secondary: '#d9a441', accent: '#d08b6a', bg: '#180d07' },
  { name: 'Forêt Ancienne', primary: '#3d5a3a', secondary: '#bfa14a', accent: '#8fae7d', bg: '#0e120c' },
]

export function ValidationScreen({
  balade,
  editing = false,
}: {
  balade: Balade
  editing?: boolean
}) {
  const router = useRouter()
  const [theme, setTheme] = useState<ThemeColor>(balade.theme_color)
  const [orderedEtapes, setOrderedEtapes] = useState(
    [...balade.etapes].sort((a, b) => a.order - b.order),
  )
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const etapes = orderedEtapes
  const hours = balade.estimated_duration_min / 60
  const tooLong = balade.estimated_duration_min > 180

  function regenerateTheme() {
    const others = PALETTES.filter((p) => p.name !== theme.name)
    setTheme(others[Math.floor(Math.random() * others.length)])
  }

  function moveEtape(index: number, delta: -1 | 1) {
    const target = index + delta
    if (target < 0 || target >= orderedEtapes.length) return
    const clone = [...orderedEtapes]
    ;[clone[index], clone[target]] = [clone[target], clone[index]]
    setOrderedEtapes(clone.map((e, i) => ({ ...e, order: i + 1 })))
  }
  function patchEtape(index: number, patch: Partial<(typeof etapes)[number]>) {
    setOrderedEtapes((prev) =>
      prev.map((e, i) => (i === index ? { ...e, ...patch } : e)),
    )
  }

  async function handleStart() {
    setError(null)
    setLoading(true)
    const themed: Balade = { ...balade, theme_color: theme }
    themed.etapes = etapes.map((e, i) => ({ ...e, order: i + 1 }))
    const html = renderBaladeHtml(themed)
    const { error: updateError } = await createClient()
      .from('balades')
      .update({
        status: editing ? balade.status : 'validated',
        theme_color: theme,
        html_content: html,
        etapes: themed.etapes,
      })
      .eq('id', balade.id)
    if (updateError) {
      setError(
        editing
          ? 'Impossible d’enregistrer les modifications. Réessaie.'
          : 'Impossible de valider la balade. Réessaie.',
      )
      setLoading(false)
      return
    }
    router.push(`/balade/${balade.id}`)
    router.refresh()
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      <div>
        <h1 className="font-mono text-xl tracking-[0.18em] text-amber-200">
          {editing ? 'MODIFIER L’ITINÉRAIRE' : 'VALIDATION DE L’ITINÉRAIRE'}
        </h1>
        <p className="mt-1 text-sm text-amber-100/45">
          {balade.title} · {balade.city}
        </p>
      </div>

      <div className="flex gap-3">
        <div className="flex-1 rounded-xl border border-amber-200/12 bg-black/30 p-3 text-center">
          <Clock size={16} className="mx-auto mb-1 text-amber-300" />
          <p className="text-lg text-amber-100">
            ~{Math.round(balade.estimated_duration_min)} min
          </p>
          <p className="text-[10px] uppercase tracking-wider text-amber-100/40">
            Durée
          </p>
        </div>
        <div className="flex-1 rounded-xl border border-amber-200/12 bg-black/30 p-3 text-center">
          <MapPin size={16} className="mx-auto mb-1 text-amber-300" />
          <p className="text-lg text-amber-100">{balade.distance_km} km</p>
          <p className="text-[10px] uppercase tracking-wider text-amber-100/40">
            Distance
          </p>
        </div>
        <div className="flex-1 rounded-xl border border-amber-200/12 bg-black/30 p-3 text-center">
          <span className="mb-1 block text-base">🚶</span>
          <p className="text-lg text-amber-100">{etapes.length}</p>
          <p className="text-[10px] uppercase tracking-wider text-amber-100/40">
            Étapes
          </p>
        </div>
      </div>

      {tooLong && (
        <div className="flex items-center gap-2 rounded-lg border border-amber-400/40 bg-amber-400/10 px-4 py-2.5 text-sm text-amber-200">
          <AlertTriangle size={16} />
          Itinéraire long ({hours.toFixed(1)} h) — prévois des pauses.
        </div>
      )}

      {/* Free route preview (no token needed) */}
      <RoutePreviewMap etapes={etapes} color={theme.secondary} />

      {/* Ordered etape list */}
      <div className="space-y-2">
        {etapes.map((e, i) => (
          <div
            key={e.id}
            className="flex items-center gap-3 rounded-xl border border-amber-200/12 bg-black/30 p-3"
          >
            <span
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: theme.primary }}
            >
              {e.order}
            </span>
            <div className="min-w-0 flex-1">
              <input
                value={e.location_name}
                onChange={(ev) => patchEtape(i, { location_name: ev.target.value })}
                placeholder="Nom du lieu"
                className="w-full rounded bg-black/20 px-2 py-1 text-sm text-amber-100"
              />
              <p className="text-[11px] text-amber-100/40">
                {e.walk_minutes} min de marche
              </p>
              <input
                value={e.action_mission}
                onChange={(ev) => patchEtape(i, { action_mission: ev.target.value })}
                placeholder="Mission complice"
                className="mt-1 w-full rounded bg-black/20 px-2 py-1 text-[11px] text-amber-100/70"
              />
              {editing && (
                <textarea
                  value={e.story_text}
                  onChange={(ev) => patchEtape(i, { story_text: ev.target.value })}
                  placeholder="Récit de l’étape"
                  rows={2}
                  className="mt-1 w-full resize-y rounded bg-black/20 px-2 py-1 text-[11px] text-amber-100/70"
                />
              )}
            </div>
            <div className="flex shrink-0 flex-col gap-1">
              <button
                type="button"
                onClick={() => moveEtape(i, -1)}
                className="rounded border border-amber-200/20 px-1.5 py-0.5 text-xs text-amber-100/80"
              >
                ▲
              </button>
              <button
                type="button"
                onClick={() => moveEtape(i, 1)}
                className="rounded border border-amber-200/20 px-1.5 py-0.5 text-xs text-amber-100/80"
              >
                ▼
              </button>
            </div>
            {e.maps_url && (
              <a
                href={e.maps_url}
                target="_blank"
                rel="noopener noreferrer"
                className="shrink-0 rounded bg-[#1a73e8] px-2.5 py-1.5 text-[11px] text-white"
              >
                🗺 Maps
              </a>
            )}
          </div>
        ))}
      </div>

      {/* Theme preview */}
      <div className="rounded-2xl border border-amber-200/12 bg-black/30 p-4">
        <div className="mb-3 flex items-center justify-between">
          <p className="text-sm text-amber-100">
            Thème : <span style={{ color: theme.secondary }}>{theme.name}</span>
          </p>
          <button
            onClick={regenerateTheme}
            className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/20 px-3 py-1.5 text-xs text-amber-100/70 transition hover:border-amber-200/40"
          >
            <Shuffle size={13} /> Regénérer le thème
          </button>
        </div>
        <div className="mb-3 flex gap-2">
          {[theme.primary, theme.secondary, theme.accent, theme.bg].map(
            (c, i) => (
              <div
                key={i}
                className="h-10 flex-1 rounded-lg border border-white/10"
                style={{ backgroundColor: c }}
                title={c}
              />
            ),
          )}
        </div>
        <div
          className="rounded-lg p-3"
          style={{ backgroundColor: theme.bg }}
        >
          <p className="text-sm italic" style={{ color: theme.secondary }}>
            Un aperçu du récit dans cette palette…
          </p>
          <CipherBlock type="cipher_caesar" display="DUHQHV · GH · OXWHFH" />
          <span
            className="inline-block rounded-full px-2.5 py-0.5 text-[9px] uppercase tracking-wider text-white"
            style={{ backgroundColor: theme.primary }}
          >
            Cardiologie
          </span>
        </div>
      </div>

      {error && <p className="text-sm text-rose-300/90">{error}</p>}

      <div className="flex gap-3">
        <button
          onClick={() =>
            router.push(editing ? `/balade/${balade.id}` : '/generate')
          }
          disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg border border-amber-200/20 px-4 py-2.5 text-sm text-amber-100/70 transition hover:border-amber-200/40 disabled:opacity-40"
        >
          <Pencil size={15} /> {editing ? 'Annuler' : 'Modifier'}
        </button>
        <button
          onClick={handleStart}
          disabled={loading}
          className="ml-auto inline-flex items-center gap-2 rounded-lg bg-amber-300 px-5 py-2.5 text-sm font-medium text-amber-950 transition hover:bg-amber-200 disabled:opacity-50"
        >
          {editing ? <Save size={16} /> : <Play size={16} />}
          {editing
            ? loading
              ? 'Enregistrement…'
              : 'Enregistrer les modifications'
            : loading
              ? 'Validation…'
              : "Ça me semble bon — Démarrer l'aventure"}
        </button>
      </div>
    </div>
  )
}
