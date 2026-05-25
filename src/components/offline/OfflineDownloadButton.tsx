'use client'

import { useState } from 'react'
import { Download, Check, Loader2 } from 'lucide-react'
import { useOffline } from '@/hooks/useOffline'
import type { Balade } from '@/types'

/** Pre-downloads a balade so it can be played without a connection. */
export function OfflineDownloadButton({ balade }: { balade: Balade }) {
  const { cacheBaladeForOffline } = useOffline()
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle')

  async function handleDownload() {
    setState('loading')
    try {
      await cacheBaladeForOffline(balade)
      setState('done')
    } catch {
      setState('idle')
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={state !== 'idle'}
      className="inline-flex items-center gap-1.5 rounded-lg border border-amber-200/20 px-3 py-1.5 text-xs text-amber-100/70 transition hover:border-amber-200/40 disabled:opacity-70"
    >
      {state === 'loading' && <Loader2 size={13} className="animate-spin" />}
      {state === 'done' && <Check size={13} className="text-emerald-400" />}
      {state === 'idle' && <Download size={13} />}
      {state === 'done'
        ? 'Disponible hors ligne'
        : state === 'loading'
          ? 'Téléchargement…'
          : 'Télécharger pour offline'}
    </button>
  )
}
