'use client'

import { useState } from 'react'
import { Loader2, MapPin, Download } from 'lucide-react'
import type { GeneratedParcours } from '@/lib/ai/parcours/types'

const inputClass =
  'w-full rounded-lg border border-amber-200/15 bg-black/40 px-3 py-2 text-sm text-amber-50 outline-none focus:border-amber-300/50'
const labelClass = 'mb-1 block text-xs uppercase tracking-wider text-amber-100/50'

export default function ParcoursPage() {
  const [city, setCity] = useState('')
  const [country, setCountry] = useState('France')
  const [duration, setDuration] = useState(120)
  const [placesText, setPlacesText] = useState('')
  const [startAddress, setStartAddress] = useState('')
  const [endAddress, setEndAddress] = useState('')
  const [loop, setLoop] = useState(true)
  const [keepOrder, setKeepOrder] = useState(false)

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [parcours, setParcours] = useState<GeneratedParcours | null>(null)
  const [html, setHtml] = useState<string | null>(null)

  async function onGenerate() {
    const places = placesText
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean)
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
    try {
      const res = await fetch('/api/parcours', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          city: city.trim(),
          country: country.trim(),
          duration_target_min: duration,
          places,
          start_address: startAddress.trim() || undefined,
          end_address: loop ? undefined : endAddress.trim() || undefined,
          loop,
          keep_order: keepOrder,
        }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data?.error ?? 'La génération a échoué.')
        return
      }
      setParcours(data.parcours as GeneratedParcours)
      setHtml(data.html as string)
    } catch {
      setError('Erreur réseau. Réessaie.')
    } finally {
      setLoading(false)
    }
  }

  function onDownload() {
    if (!html || !parcours) return
    const blob = new Blob([html], { type: 'text/html' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${parcours.title.replace(/[^\w\s-]/g, '').trim() || 'parcours'}.html`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-8">
      <header className="mb-6">
        <h1 className="font-mono text-lg tracking-[0.2em] text-amber-200">
          PARCOURS
        </h1>
        <p className="mt-1 text-sm text-amber-100/50">
          Tes lieux, une ville — on organise la balade, avec anecdotes et petites
          questions (sans énigmes). Idéal pour visiter.
        </p>
      </header>

      <div className="space-y-4 rounded-2xl border border-amber-200/10 bg-black/20 p-5">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Ville</label>
            <input
              className={inputClass}
              value={city}
              onChange={(e) => setCity(e.target.value)}
              placeholder="Bordeaux"
            />
          </div>
          <div>
            <label className={labelClass}>Pays</label>
            <input
              className={inputClass}
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              placeholder="France"
            />
          </div>
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

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className={labelClass}>Départ (optionnel)</label>
            <input
              className={inputClass}
              value={startAddress}
              onChange={(e) => setStartAddress(e.target.value)}
              placeholder="Adresse ou lieu de départ"
            />
          </div>
          <div>
            <label className={labelClass}>
              Arrivée {loop ? '(boucle)' : '(optionnel)'}
            </label>
            <input
              className={inputClass}
              value={endAddress}
              onChange={(e) => setEndAddress(e.target.value)}
              placeholder={loop ? 'Retour au départ' : 'Adresse ou lieu d’arrivée'}
              disabled={loop}
            />
          </div>
        </div>

        <div className="flex items-center gap-4">
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
        </div>

        <div className="flex flex-wrap gap-4 text-sm text-amber-100/70">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={loop}
              onChange={(e) => setLoop(e.target.checked)}
            />
            Boucle (retour au départ)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={keepOrder}
              onChange={(e) => setKeepOrder(e.target.checked)}
            />
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
              <h2 className="font-serif text-xl text-amber-100">
                {parcours.title}
              </h2>
              <p className="text-sm text-amber-100/50">
                {parcours.stops.length} arrêts · {parcours.distance_km} km ·{' '}
                {Math.round((parcours.estimated_duration_min / 60) * 10) / 10}h
                {parcours.is_loop ? ' · boucle' : ''}
              </p>
            </div>
            <div className="flex gap-2">
              {parcours.google_maps_urls.map((url, i) => (
                <a
                  key={i}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg bg-[#1a73e8] px-3 py-2 text-sm text-white"
                >
                  🗺 Google Maps
                  {parcours.google_maps_urls.length > 1 ? ` (${i + 1})` : ''}
                </a>
              ))}
              <button
                type="button"
                onClick={onDownload}
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

          <iframe
            title="Aperçu du parcours"
            srcDoc={html}
            className="h-[70vh] w-full rounded-2xl border border-amber-200/10 bg-white"
          />
        </section>
      )}
    </div>
  )
}
