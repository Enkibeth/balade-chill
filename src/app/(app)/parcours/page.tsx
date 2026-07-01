'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { Loader2, MapPin, Download, Sparkles, CheckCircle2, Trash2 } from 'lucide-react'
import type { GeneratedParcours } from '@/lib/ai/parcours/types'
import type { SuggestedPlace, PlacesMode } from '@/lib/ai/parcours/places-prompt'
import type { StartEndValue } from '@/components/map/StartEndPicker'
import {
  saveParcours,
  listParcours,
  deleteParcours,
  type SavedParcours,
} from '@/lib/offline/idb'

const StartEndPicker = dynamic(
  () => import('@/components/map/StartEndPicker').then((m) => m.StartEndPicker),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-64 items-center justify-center rounded-2xl border border-amber-200/15 bg-black/30 text-xs text-amber-100/40">
        Chargement de la carte…
      </div>
    ),
  },
)

const inputClass =
  'w-full rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50'
const labelClass = 'mb-1 block text-xs uppercase tracking-wider text-amber-100/50'

const STATUS_BADGE: Record<string, { text: string; className: string }> = {
  corrected: { text: 'corrigé', className: 'bg-amber-300/15 text-amber-200' },
  added: { text: 'ajouté', className: 'bg-emerald-400/15 text-emerald-200' },
  doubtful: { text: 'à vérifier', className: 'bg-rose-400/15 text-rose-200' },
}

const keyOf = (p: SuggestedPlace) => p.name.toLowerCase()

export default function ParcoursPage() {
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('France')
  const [duration, setDuration] = useState(120)
  const [placesText, setPlacesText] = useState('')
  const [keepOrder, setKeepOrder] = useState(false)
  const [startEnd, setStartEnd] = useState<StartEndValue>({
    start: null,
    end: null,
    loop: true,
  })

  // AI place suggestions / enrichment.
  const [interests, setInterests] = useState('')
  const [candidates, setCandidates] = useState<SuggestedPlace[] | null>(null)
  const [candidatesMode, setCandidatesMode] = useState<PlacesMode>('suggest')
  const [picked, setPicked] = useState<Record<string, boolean>>({})
  const [placesLoading, setPlacesLoading] = useState<PlacesMode | null>(null)
  const [placesError, setPlacesError] = useState<string | null>(null)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parcours, setParcours] = useState<GeneratedParcours | null>(null)
  const [html, setHtml] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [savedList, setSavedList] = useState<SavedParcours[]>([])

  // Load from the server (multi-device sync); mirror into IndexedDB for
  // offline. If the network/table is unavailable, fall back to the local copy.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch('/api/parcours')
        if (!res.ok) throw new Error('offline')
        const data = await res.json()
        const records = (data.records ?? []) as SavedParcours[]
        if (cancelled) return
        setSavedList(records)
        // Refresh the offline mirror to match the server.
        await Promise.all(records.map((r) => saveParcours(r).catch(() => {})))
      } catch {
        const local = await listParcours().catch(() => [])
        if (!cancelled) setSavedList(local)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  function currentPlaces(): string[] {
    return placesText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
  }

  async function fetchPlaces(mode: PlacesMode) {
    if (!city.trim() || !country.trim()) {
      setPlacesError('Renseigne d’abord la ville et le pays.')
      return
    }
    const existing = currentPlaces()
    if (mode === 'enrich' && existing.length === 0) {
      setPlacesError('Ta liste est vide — utilise « Proposer des lieux ».')
      return
    }
    setPlacesLoading(mode)
    setPlacesError(null)
    try {
      const res = await fetch('/api/parcours/places', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode,
          city: city.trim(),
          country: country.trim(),
          interests: interests.trim() || undefined,
          places: existing,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setPlacesError(data?.error ?? 'La suggestion a échoué.')
        return
      }
      const list = data.places as SuggestedPlace[]
      setCandidates(list)
      setCandidatesMode(mode)
      // Pre-check everything except the ones flagged doubtful.
      setPicked(Object.fromEntries(list.map((p) => [keyOf(p), p.status !== 'doubtful'])))
    } catch {
      setPlacesError('Erreur réseau. Réessaie.')
    } finally {
      setPlacesLoading(null)
    }
  }

  function applyCandidates() {
    if (!candidates) return
    const selected = candidates.filter((p) => picked[keyOf(p)]).map((p) => p.name)
    if (candidatesMode === 'enrich') {
      // Enrich returns the full corrected list → replace.
      setPlacesText(selected.join('\n'))
    } else {
      // Suggest → append to what's already there, de-duplicated.
      const have = new Set(currentPlaces().map((p) => p.toLowerCase()))
      const merged = [...currentPlaces()]
      for (const name of selected) {
        if (!have.has(name.toLowerCase())) merged.push(name)
      }
      setPlacesText(merged.join('\n'))
    }
    setCandidates(null)
    setPicked({})
  }

  async function onGenerate() {
    const places = currentPlaces()
    if (!city.trim() || !country.trim()) {
      setError('Renseigne la ville et le pays.')
      return
    }
    if (places.length < 2) {
      setError('Ajoute au moins 2 lieux (un par ligne).')
      return
    }
    setLoading(true)
    setError(null)
    setParcours(null)
    setHtml(null)
    setSaved(false)
    try {
      const res = await fetch('/api/parcours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: city.trim(),
          country: country.trim(),
          duration_target_min: duration,
          places,
          start_point: startEnd.start
            ? { lat: startEnd.start.lat, lng: startEnd.start.lng, label: startEnd.start.label }
            : undefined,
          end_point:
            !startEnd.loop && startEnd.end
              ? { lat: startEnd.end.lat, lng: startEnd.end.lng, label: startEnd.end.label }
              : undefined,
          loop: startEnd.loop,
          keep_order: keepOrder,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'La génération a échoué.')
        return
      }
      // Server persisted → { record }. Fallback (table missing) → { parcours, html }.
      const record: SavedParcours = data.record
        ? (data.record as SavedParcours)
        : {
            ...(data.parcours as GeneratedParcours),
            id: crypto.randomUUID(),
            created_at: new Date().toISOString(),
            html: data.html as string,
          }
      setParcours(record)
      setHtml(record.html)
      // Mirror into IndexedDB (offline) and show it at the top of the list.
      try {
        await saveParcours(record)
      } catch {
        /* offline mirror is best-effort */
      }
      setSaved(true)
      setSavedList((prev) => [record, ...prev.filter((r) => r.id !== record.id)])
    } catch {
      setError('Erreur réseau. Réessaie.')
    } finally {
      setLoading(false)
    }
  }

  function downloadHtml(h: string, title: string) {
    const blob = new Blob([h], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${title.replace(/[^\w\s-]/g, '').trim() || 'parcours'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  function openSaved(rec: SavedParcours) {
    setParcours(rec)
    setHtml(rec.html)
    setSaved(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  async function removeSaved(id: string) {
    // Delete on the server (source of truth) then the offline mirror.
    try {
      await fetch(`/api/parcours?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
    } catch {
      /* if offline, still drop it locally */
    }
    await deleteParcours(id).catch(() => {})
    setSavedList((prev) => prev.filter((r) => r.id !== id))
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-mono text-lg tracking-[0.2em] text-amber-200">PARCOURS</h1>
        <p className="mt-1 text-sm text-amber-100/50">
          Tes lieux, une ville — on organise la balade, avec anecdotes et petites
          questions (sans énigmes). Idéal pour visiter.
        </p>
      </header>

      <div className="space-y-4 rounded-2xl border border-amber-200/10 bg-black/20 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Ville</label>
            <input className={inputClass} value={city} onChange={(e) => setCity(e.target.value)} placeholder="Bordeaux" />
          </div>
          <div>
            <label className={labelClass}>Pays</label>
            <input className={inputClass} value={country} onChange={(e) => setCountry(e.target.value)} placeholder="France" />
          </div>
        </div>

        {/* AI place suggestions / enrichment */}
        <div className="rounded-xl border border-amber-200/10 bg-amber-300/[0.03] p-3">
          <label className={labelClass}>Pas d’idées ? Laisse l’IA proposer ou vérifier</label>
          <input
            className={`${inputClass} mb-2`}
            value={interests}
            onChange={(e) => setInterests(e.target.value)}
            placeholder="Centres d’intérêt (optionnel) : street art, histoire, gastronomie…"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => fetchPlaces('suggest')}
              disabled={placesLoading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-300/40 px-3 py-1.5 text-xs text-amber-100 transition hover:bg-amber-300/10 disabled:opacity-40"
            >
              {placesLoading === 'suggest' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}
              Proposer des lieux phares
            </button>
            <button
              type="button"
              onClick={() => fetchPlaces('enrich')}
              disabled={placesLoading !== null}
              className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/20 px-3 py-1.5 text-xs text-amber-100/80 transition hover:border-amber-200/40 disabled:opacity-40"
            >
              {placesLoading === 'enrich' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              Vérifier / enrichir ma liste
            </button>
          </div>
          {placesError && <p className="mt-2 text-xs text-rose-300">{placesError}</p>}

          {candidates && (
            <div className="mt-3 space-y-2">
              <ul className="max-h-64 divide-y divide-amber-200/10 overflow-y-auto rounded-lg border border-amber-200/10 bg-black/30">
                {candidates.map((p) => {
                  const badge = p.status ? STATUS_BADGE[p.status] : undefined
                  return (
                    <li key={keyOf(p)} className="flex items-start gap-2 px-3 py-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1 accent-amber-300"
                        checked={!!picked[keyOf(p)]}
                        onChange={(e) => setPicked((prev) => ({ ...prev, [keyOf(p)]: e.target.checked }))}
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-50">{p.name}</span>
                          {badge && (
                            <span className={`rounded px-1.5 py-0.5 text-[10px] uppercase tracking-wide ${badge.className}`}>
                              {badge.text}
                            </span>
                          )}
                          {p.category && <span className="text-[11px] text-amber-100/40">{p.category}</span>}
                        </div>
                        {p.note && <p className="text-[11px] text-amber-100/50">{p.note}</p>}
                      </div>
                    </li>
                  )
                })}
              </ul>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={applyCandidates}
                  className="rounded-lg bg-amber-300/90 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-amber-200"
                >
                  {candidatesMode === 'enrich' ? 'Remplacer ma liste par la sélection' : 'Ajouter la sélection à ma liste'}
                </button>
                <button type="button" onClick={() => setCandidates(null)} className="rounded-lg border border-amber-200/15 px-3 py-1.5 text-xs text-amber-100/60">
                  Annuler
                </button>
              </div>
            </div>
          )}
        </div>

        <div>
          <label className={labelClass}>Lieux à voir (un par ligne)</label>
          <textarea
            className={`${inputClass} min-h-[140px] font-mono`}
            value={placesText}
            onChange={(e) => setPlacesText(e.target.value)}
            placeholder={'Grosse Cloche\nMiroir d’eau\nPlace de la Bourse\nCathédrale Saint-André'}
          />
        </div>

        {/* Map picker for start / end */}
        <div>
          <label className={labelClass}>Départ / arrivée (carte)</label>
          <StartEndPicker city={city} country={country} value={startEnd} onChange={setStartEnd} />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <label className={labelClass + ' mb-0'}>
            Durée
            <input
              type="number"
              min={30}
              step={15}
              className={`${inputClass} mt-1 w-28`}
              value={duration}
              onChange={(e) => setDuration(Number(e.target.value) || 120)}
            />
            <span className="ml-2 text-amber-100/40">min</span>
          </label>
          <label className="flex items-center gap-2 text-sm text-amber-100/70">
            <input type="checkbox" checked={keepOrder} onChange={(e) => setKeepOrder(e.target.checked)} className="accent-amber-300" />
            Garder mon ordre
          </label>
        </div>

        <button
          type="button"
          onClick={onGenerate}
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-amber-300/90 px-4 py-3 font-medium text-black transition hover:bg-amber-200 disabled:opacity-50"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Génération…
            </>
          ) : (
            <>
              <MapPin className="h-4 w-4" /> Générer le parcours
            </>
          )}
        </button>

        {error && <p className="text-sm text-rose-300">{error}</p>}
        {loading && (
          <p className="text-xs text-amber-100/40">
            Géolocalisation des lieux (≈1 s par lieu) puis rédaction…
          </p>
        )}
      </div>

      {parcours && html && (
        <section className="mt-8 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="font-serif text-xl text-amber-100">{parcours.title}</h2>
              <p className="text-sm text-amber-100/50">
                {parcours.stops.length} arrêts · {parcours.distance_km} km ·{' '}
                {Math.round((parcours.estimated_duration_min / 60) * 10) / 10}h
                {parcours.is_loop ? ' · boucle' : ''}
                {saved && <span className="ml-2 text-emerald-300">· enregistré ✓</span>}
              </p>
            </div>
            <div className="flex gap-2">
              {parcours.google_maps_urls.map((url, i) => (
                <a key={i} href={url} target="_blank" rel="noreferrer" className="rounded-lg bg-[#1a73e8] px-3 py-2 text-sm text-white">
                  🗺 Google Maps{parcours.google_maps_urls.length > 1 ? ` (${i + 1})` : ''}
                </a>
              ))}
              <button
                type="button"
                onClick={() => downloadHtml(html, parcours.title)}
                className="flex items-center gap-2 rounded-lg border border-amber-200/20 px-3 py-2 text-sm text-amber-100/80"
              >
                <Download className="h-4 w-4" /> Télécharger
              </button>
            </div>
          </div>

          {parcours.unresolved.length > 0 && (
            <p className="rounded-lg border border-rose-300/20 bg-rose-500/5 px-3 py-2 text-sm text-rose-200/80">
              Lieux non localisés (ignorés) : {parcours.unresolved.join(', ')}
            </p>
          )}

          <iframe title="Aperçu du parcours" srcDoc={html} className="h-[70vh] w-full rounded-2xl border border-amber-200/10 bg-white" />
        </section>
      )}

      {savedList.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 font-mono text-sm tracking-[0.2em] text-amber-200/80">MES PARCOURS</h2>
          <ul className="space-y-2">
            {savedList.map((rec) => (
              <li key={rec.id} className="flex items-center gap-3 rounded-xl border border-amber-200/10 bg-black/20 px-4 py-3">
                <button type="button" onClick={() => openSaved(rec)} className="flex-1 text-left">
                  <div className="text-sm text-amber-100">{rec.title}</div>
                  <div className="text-xs text-amber-100/45">
                    {rec.city} · {rec.stops.length} arrêts · {rec.distance_km} km ·{' '}
                    {new Date(rec.created_at).toLocaleDateString('fr-FR')}
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => downloadHtml(rec.html, rec.title)}
                  className="rounded-lg border border-amber-200/15 p-2 text-amber-100/60 transition hover:text-amber-100"
                  title="Télécharger"
                >
                  <Download className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => removeSaved(rec.id)}
                  className="rounded-lg border border-rose-300/15 p-2 text-rose-300/60 transition hover:text-rose-300"
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}
