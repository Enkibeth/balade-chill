'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { Play, Trash2 } from 'lucide-react'
import type { GlobeBalade } from '@/components/map/BaladeGlobe'

const DIFF_LABEL: Record<string, string> = {
  facile: 'Facile',
  moyen: 'Moyen',
  difficile: 'Difficile',
  boss: 'Boss',
}

export function BaladeSidebar({
  items,
  selectedId,
  onSelect,
  onDelete,
  deletingId,
}: {
  items: GlobeBalade[]
  selectedId: string | null
  onSelect: (id: string) => void
  onDelete: (id: string) => void
  deletingId: string | null
}) {
  // Two-step confirm so a single tap never destroys a balade.
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const sorted = useMemo(
    () =>
      [...items].sort(
        (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
      ),
    [items],
  )

  const stats = useMemo(() => {
    const cities = new Set(items.map((i) => i.balade.city.toLowerCase()))
    const days = new Set(items.map((i) => i.date.slice(0, 10)))
    const avg =
      items.length > 0
        ? Math.round(
            items.reduce((s, i) => s + i.score, 0) / items.length,
          )
        : 0
    return { total: items.length, avg, cities: cities.size, days: days.size }
  }, [items])

  return (
    <div className="flex h-full flex-col gap-4">
      <div className="grid grid-cols-4 gap-2">
        <Stat label="Balades" value={stats.total} />
        <Stat label="Score moy." value={stats.avg} />
        <Stat label="Villes" value={stats.cities} />
        <Stat label="Jours" value={stats.days} />
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto">
        {sorted.length === 0 && (
          <div className="rounded-2xl border border-amber-200/12 bg-black/30 p-6 text-center">
            <p className="text-sm text-amber-100/50">
              Aucune balade pour l&apos;instant.
            </p>
            <Link
              href="/generate"
              className="mt-3 inline-block rounded-lg bg-amber-300 px-4 py-2 text-sm font-medium text-amber-950"
            >
              Générer la première
            </Link>
          </div>
        )}

        {sorted.map((item) => {
          const b = item.balade
          const active = b.id === selectedId
          return (
            <button
              key={b.id}
              onClick={() => onSelect(b.id)}
              className={`w-full rounded-xl border p-3 text-left transition ${
                active
                  ? 'border-amber-300/50 bg-amber-300/10'
                  : 'border-amber-200/12 bg-black/30 hover:border-amber-200/25'
              }`}
            >
              <div className="flex items-start justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: b.theme_color.primary }}
                  />
                  <span className="text-sm text-amber-100">{b.title}</span>
                </div>
                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-[10px] text-amber-950"
                  style={{ backgroundColor: b.theme_color.secondary }}
                >
                  {item.score} pts
                </span>
              </div>
              <div className="mt-1.5 flex items-center gap-2 text-[11px] text-amber-100/40">
                <span>{b.city}</span>
                <span>·</span>
                <span>{new Date(item.date).toLocaleDateString('fr-FR')}</span>
                <span>·</span>
                <span>{DIFF_LABEL[b.difficulty] ?? b.difficulty}</span>
              </div>
              {active && (
                <div className="mt-2 flex items-center gap-2">
                  <Link
                    href={`/balade/${b.id}`}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-medium text-amber-950"
                  >
                    <Play size={12} /> Ouvrir la balade
                  </Link>
                  {confirmId === b.id ? (
                    <span className="inline-flex items-center gap-1.5">
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          onDelete(b.id)
                          setConfirmId(null)
                        }}
                        className="inline-flex cursor-pointer items-center gap-1 rounded-lg bg-rose-500/90 px-3 py-1.5 text-xs font-medium text-white hover:bg-rose-500"
                      >
                        {deletingId === b.id ? 'Suppression…' : 'Confirmer'}
                      </span>
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(ev) => {
                          ev.stopPropagation()
                          setConfirmId(null)
                        }}
                        className="cursor-pointer rounded-lg border border-amber-200/20 px-2.5 py-1.5 text-xs text-amber-100/70"
                      >
                        Annuler
                      </span>
                    </span>
                  ) : (
                    <span
                      role="button"
                      tabIndex={0}
                      title="Supprimer cette balade"
                      onClick={(ev) => {
                        ev.stopPropagation()
                        setConfirmId(b.id)
                      }}
                      className="ml-auto inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-rose-400/30 px-2.5 py-1.5 text-xs text-rose-300/80 transition hover:border-rose-400/60 hover:text-rose-200"
                    >
                      <Trash2 size={13} /> Supprimer
                    </span>
                  )}
                </div>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-amber-200/12 bg-black/30 p-2 text-center">
      <p className="text-lg font-semibold text-amber-200">{value}</p>
      <p className="text-[9px] uppercase tracking-wider text-amber-100/40">
        {label}
      </p>
    </div>
  )
}
