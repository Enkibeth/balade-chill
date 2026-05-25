'use client'

import { useCallback, useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { upsertSession } from '@/lib/supabase/queries'
import {
  cacheBalade,
  getPendingScores,
  clearPendingScore,
} from '@/lib/offline/idb'
import type { Balade } from '@/types'

/** Online/offline state plus offline-sync and pre-caching helpers. */
export function useOffline() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    setIsOnline(navigator.onLine)
    const on = () => setIsOnline(true)
    const off = () => setIsOnline(false)
    window.addEventListener('online', on)
    window.addEventListener('offline', off)
    return () => {
      window.removeEventListener('online', on)
      window.removeEventListener('offline', off)
    }
  }, [])

  /** Flushes locally queued score updates to Supabase. Returns count synced. */
  const syncPendingScores = useCallback(async (): Promise<number> => {
    const pending = await getPendingScores()
    if (pending.length === 0) return 0
    const supabase = createClient()
    let synced = 0
    for (const s of pending) {
      try {
        await upsertSession(supabase, {
          ...(s.id ? { id: s.id } : {}),
          balade_id: s.balade_id,
          user_id: s.user_id,
          completed_at: s.completed_at,
          current_etape: s.current_etape,
          enigme_scores: s.enigme_scores,
          medical_scores: s.medical_scores,
          mission_scores: s.mission_scores,
          total_score: s.total_score,
          notes: s.notes,
        })
        await clearPendingScore(s.balade_id)
        synced += 1
      } catch {
        // Still offline / failing — leave it queued for the next attempt.
      }
    }
    return synced
  }, [])

  /** Pre-downloads a balade (and warms the SW page cache) for offline use. */
  const cacheBaladeForOffline = useCallback(async (balade: Balade) => {
    await cacheBalade(balade)
    try {
      await fetch(`/balade/${balade.id}`, { cache: 'reload' })
    } catch {
      // Page warm-up is best-effort.
    }
  }, [])

  return { isOnline, syncPendingScores, cacheBaladeForOffline }
}
