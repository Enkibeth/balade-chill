'use client'

import { useEffect, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { BaladeSidebar } from './BaladeSidebar'
import type { GlobeBalade } from '@/components/map/BaladeGlobe'

// Leaflet touches `window`, so the map is loaded client-side only.
const BaladeGlobe = dynamic(
  () => import('@/components/map/BaladeGlobe').then((m) => m.BaladeGlobe),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-amber-200/15 bg-black/40">
        <p className="text-sm text-amber-100/40">Chargement de la carte…</p>
      </div>
    ),
  },
)

export function DashboardView({
  items: initialItems,
  mapboxToken,
}: {
  items: GlobeBalade[]
  mapboxToken: string | null
}) {
  const router = useRouter()
  // Local copy so a deleted balade disappears instantly (optimistic), while the
  // server refresh reconciles the source of truth.
  const [items, setItems] = useState<GlobeBalade[]>(initialItems)
  const [selectedId, setSelectedId] = useState<string | null>(
    initialItems[0]?.balade.id ?? null,
  )
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  // Keep local list in sync when the server re-renders with fresh data.
  useEffect(() => {
    setItems(initialItems)
  }, [initialItems])

  async function handleDelete(id: string) {
    setError(null)
    setDeletingId(id)
    const { error: delError } = await createClient()
      .from('balades')
      .delete()
      .eq('id', id)
    setDeletingId(null)
    if (delError) {
      setError('Impossible de supprimer la balade. Réessaie.')
      return
    }
    setItems((prev) => {
      const next = prev.filter((i) => i.balade.id !== id)
      if (selectedId === id) setSelectedId(next[0]?.balade.id ?? null)
      return next
    })
    router.refresh()
  }

  return (
    <div className="space-y-3">
      {error && (
        <p className="rounded-lg border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
          {error}
        </p>
      )}
      <div className="grid gap-4 lg:grid-cols-5">
        <div className="h-[420px] lg:col-span-3 lg:h-[640px]">
          <BaladeGlobe
            items={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            mapboxToken={mapboxToken}
          />
        </div>
        <div className="lg:col-span-2 lg:h-[640px]">
          <BaladeSidebar
            items={items}
            selectedId={selectedId}
            onSelect={setSelectedId}
            onDelete={handleDelete}
            deletingId={deletingId}
          />
        </div>
      </div>
    </div>
  )
}
