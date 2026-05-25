'use client'

import { useState } from 'react'
import dynamic from 'next/dynamic'
import { BaladeSidebar } from './BaladeSidebar'
import type { GlobeBalade } from '@/components/map/BaladeGlobe'

// Mapbox GL touches `window`, so the globe is loaded client-side only.
const BaladeGlobe = dynamic(
  () => import('@/components/map/BaladeGlobe').then((m) => m.BaladeGlobe),
  {
    ssr: false,
    loading: () => (
      <div className="flex h-full min-h-[320px] items-center justify-center rounded-2xl border border-amber-200/15 bg-black/40">
        <p className="text-sm text-amber-100/40">Chargement du globe…</p>
      </div>
    ),
  },
)

export function DashboardView({ items }: { items: GlobeBalade[] }) {
  const [selectedId, setSelectedId] = useState<string | null>(
    items[0]?.balade.id ?? null,
  )

  return (
    <div className="grid gap-4 lg:grid-cols-5">
      <div className="h-[420px] lg:col-span-3 lg:h-[640px]">
        <BaladeGlobe
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
      <div className="lg:col-span-2 lg:h-[640px]">
        <BaladeSidebar
          items={items}
          selectedId={selectedId}
          onSelect={setSelectedId}
        />
      </div>
    </div>
  )
}
