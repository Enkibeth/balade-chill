'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { Sparkles, MapPin, Loader2, X } from 'lucide-react'
import type { PickedPoint } from '@/components/map/PointPicker'
import type { Balade, Etape } from '@/types'

const PointPicker = dynamic(
  () => import('@/components/map/PointPicker').then((m) => m.PointPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-56 items-center justify-center rounded-2xl border border-amber-200/15 bg-black/30 text-xs text-amber-100/40">
        Chargement de la carte…
      </div>
    ),
  },
)

type EditMode = 'prompt' | 'place'

interface Neighbour {
  location_name: string
  lat: number
  lng: number
}

const toNeighbour = (e: Etape | undefined): Neighbour | null =>
  e ? { location_name: e.location_name, lat: e.lat, lng: e.lng } : null

/**
 * Inline editor offering the two "modify this étape" alternatives:
 *  - "Modifier par IA"  → free-text prompt, AI fully reworks the étape.
 *  - "Choisir un lieu"  → pin an exact point + name on the map, AI writes a
 *                         coherent story/mission/énigme anchored to that place.
 * Both call /api/etape/regenerate and hand the result back via onApply.
 */
export function EtapeEditor({
  balade,
  etape,
  prev,
  next,
  onApply,
  onClose,
}: {
  balade: Balade
  etape: Etape
  prev: Etape | undefined
  next: Etape | undefined
  onApply: (patch: Partial<Etape>) => void
  onClose: () => void
}) {
  const [mode, setMode] = useState<EditMode>('prompt')
  const [prompt, setPrompt] = useState('')
  const [point, setPoint] = useState<PickedPoint | null>(
    etape.lat && etape.lng
      ? { lat: etape.lat, lng: etape.lng, label: etape.location_name }
      : null,
  )
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function submit() {
    setError(null)
    if (mode === 'prompt' && !prompt.trim()) {
      setError('Décris ce que tu aimerais modifier.')
      return
    }
    if (mode === 'place' && !point) {
      setError('Place d’abord un lieu sur la carte.')
      return
    }
    setBusy(true)
    try {
      const body: Record<string, unknown> = {
        city: balade.city,
        country: balade.country,
        difficulty: balade.difficulty,
        order: etape.order,
        enigme_type: etape.enigme.type,
        avoid: etape.location_name,
        wants_medical: Boolean(etape.medical_bonus),
        bonus_category: etape.medical_bonus?.category ?? 'medical',
        bonus_label: etape.medical_bonus?.label ?? '',
        specialties: balade.medical_specs,
        prev: toNeighbour(prev),
        next: toNeighbour(next),
        mode,
      }
      if (mode === 'prompt') {
        body.user_prompt = prompt.trim()
      } else if (point) {
        body.placed = {
          location_name:
            point.label ?? `${point.lat.toFixed(5)}, ${point.lng.toFixed(5)}`,
          lat: point.lat,
          lng: point.lng,
        }
      }
      const res = await fetch('/api/etape/regenerate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null)
      if (!res.ok || !data?.etape) {
        setError(data?.error ?? 'Modification impossible. Réessaie.')
        return
      }
      const n = data.etape as Partial<Etape>
      onApply({
        location_name: n.location_name ?? etape.location_name,
        lat: n.lat ?? etape.lat,
        lng: n.lng ?? etape.lng,
        maps_url: n.maps_url ?? etape.maps_url,
        story_text: n.story_text ?? etape.story_text,
        direction_text: n.direction_text ?? etape.direction_text,
        action_mission: n.action_mission ?? etape.action_mission,
        enigme: n.enigme ?? etape.enigme,
        medical_bonus: n.medical_bonus ?? etape.medical_bonus,
      })
      onClose()
    } catch {
      setError('Erreur réseau pendant la modification.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mt-1 space-y-3 rounded-xl border border-amber-200/20 bg-black/40 p-3">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {(['prompt', 'place'] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[11px] transition ${
                mode === m
                  ? 'border-amber-300/60 bg-amber-300/10 text-amber-100'
                  : 'border-amber-200/15 text-amber-100/55 hover:border-amber-200/35'
              }`}
            >
              {m === 'prompt' ? (
                <Sparkles size={12} />
              ) : (
                <MapPin size={12} />
              )}
              {m === 'prompt' ? 'Modifier par IA' : 'Choisir un lieu'}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded p-1 text-amber-100/50 transition hover:text-amber-100/90"
          aria-label="Fermer"
        >
          <X size={14} />
        </button>
      </div>

      {mode === 'prompt' ? (
        <div className="space-y-1.5">
          <p className="text-[11px] text-amber-100/45">
            Décris ce que tu veux changer : l’IA réécrit le lieu, le récit, la
            mission et/ou l’énigme en conséquence.
          </p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ex : remplace par une librairie cachée et rends l’énigme plus facile ; ou : garde le lieu mais rends la mission plus romantique…"
            rows={3}
            className="w-full resize-y rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50"
          />
        </div>
      ) : (
        <div className="space-y-1.5">
          <p className="text-[11px] text-amber-100/45">
            Place le point exact où tu veux cette étape : l’IA garde ce lieu et
            génère une mission et une histoire cohérentes avec lui.
          </p>
          <PointPicker
            city={balade.city}
            country={balade.country}
            value={point}
            onChange={setPoint}
          />
        </div>
      )}

      {error && <p className="text-[11px] text-rose-300/90">{error}</p>}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className="inline-flex items-center gap-1.5 rounded-lg bg-amber-300 px-3 py-1.5 text-[11px] font-medium text-amber-950 transition hover:bg-amber-200 disabled:opacity-50"
        >
          {busy ? (
            <Loader2 size={12} className="animate-spin" />
          ) : (
            <Sparkles size={12} />
          )}
          {busy
            ? 'Génération…'
            : mode === 'prompt'
              ? 'Régénérer avec ce prompt'
              : 'Générer autour de ce lieu'}
        </button>
      </div>
    </div>
  )
}
