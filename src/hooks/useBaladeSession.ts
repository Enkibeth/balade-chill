'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { upsertSession, type SessionUpsert } from '@/lib/supabase/queries'
import {
  cacheSession,
  queuePendingScore,
  clearPendingScore,
} from '@/lib/offline/idb'
import type { Balade, BaladeSession } from '@/types'

type ScoreMap = Record<string, boolean>

function countTrue(...maps: ScoreMap[]): number {
  return maps.reduce(
    (sum, m) => sum + Object.values(m).filter(Boolean).length,
    0,
  )
}

function emptySession(baladeId: string, userId: string): BaladeSession {
  return {
    id: '',
    balade_id: baladeId,
    user_id: userId,
    started_at: new Date().toISOString(),
    completed_at: null,
    current_etape: 0,
    enigme_scores: {},
    medical_scores: {},
    mission_scores: {},
    total_score: 0,
    notes: '',
  }
}

export interface UseBaladeSession {
  session: BaladeSession
  synced: boolean
  totalScore: number
  maxScore: number
  toggleEnigme: (enigmeId: string) => void
  toggleMedical: (medicalId: string) => void
  toggleMission: (etapeId: string) => void
  setCurrentEtape: (order: number) => void
  complete: () => void
}

/**
 * Tracks a live balade session: holds score state, persists it to Supabase
 * with a 2s debounce, and exposes toggles for the runner UI.
 */
export function useBaladeSession(
  balade: Balade,
  userId: string,
  initial: BaladeSession | null,
): UseBaladeSession {
  const [session, setSession] = useState<BaladeSession>(
    () => initial ?? emptySession(balade.id, userId),
  )
  const [synced, setSynced] = useState(true)

  const idRef = useRef(session.id)
  const sessionRef = useRef(session)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const persist = useCallback(async (s: BaladeSession) => {
    const local: BaladeSession = { ...s, id: idRef.current }
    // Always mirror locally first so the session survives offline.
    void cacheSession(local).catch(() => {})

    const payload: SessionUpsert = {
      ...(idRef.current ? { id: idRef.current } : {}),
      balade_id: s.balade_id,
      user_id: s.user_id,
      completed_at: s.completed_at,
      current_etape: s.current_etape,
      enigme_scores: s.enigme_scores,
      medical_scores: s.medical_scores,
      mission_scores: s.mission_scores,
      total_score: s.total_score,
      notes: s.notes,
    }
    try {
      const saved = await upsertSession(createClient(), payload)
      idRef.current = saved.id
      setSynced(true)
      void clearPendingScore(s.balade_id).catch(() => {})
    } catch {
      // Offline or failing — queue the update for later sync.
      void queuePendingScore(local).catch(() => {})
      setSynced(false)
    }
  }, [])

  // Debounced persistence whenever the session changes.
  useEffect(() => {
    setSynced(false)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => void persist(session), 2000)
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [session, persist])

  const toggleIn = useCallback(
    (key: 'enigme_scores' | 'medical_scores' | 'mission_scores', id: string) => {
      setSession((prev) => {
        const map = { ...prev[key], [id]: !prev[key][id] }
        const next = { ...prev, [key]: map }
        next.total_score = countTrue(
          next.enigme_scores,
          next.medical_scores,
          next.mission_scores,
        )
        return next
      })
    },
    [],
  )

  const toggleEnigme = useCallback(
    (id: string) => toggleIn('enigme_scores', id),
    [toggleIn],
  )
  const toggleMedical = useCallback(
    (id: string) => toggleIn('medical_scores', id),
    [toggleIn],
  )
  const toggleMission = useCallback(
    (id: string) => toggleIn('mission_scores', id),
    [toggleIn],
  )

  const setCurrentEtape = useCallback((order: number) => {
    setSession((prev) =>
      prev.current_etape === order ? prev : { ...prev, current_etape: order },
    )
  }, [])

  const complete = useCallback(() => {
    const current = sessionRef.current
    const next: BaladeSession = {
      ...current,
      completed_at: current.completed_at ?? new Date().toISOString(),
      current_etape: balade.etapes.length,
    }
    setSession(next)
    void persist(next)
  }, [balade.etapes.length, persist])

  const maxScore =
    balade.etapes.length * 2 +
    balade.etapes.filter((e) => e.medical_bonus).length

  return {
    session,
    synced,
    totalScore: session.total_score,
    maxScore,
    toggleEnigme,
    toggleMedical,
    toggleMission,
    setCurrentEtape,
    complete,
  }
}
