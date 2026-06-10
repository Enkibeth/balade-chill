'use client'

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from 'react'
import type { GenerationRequest } from '@/types'

/**
 * Background balade generation.
 *
 * The generation request takes 30-90s. Doing the `fetch` inside the
 * /generate page means it dies the instant the user navigates away (the
 * component unmounts and the redirect on success is lost). This provider
 * lives in the (app) layout, which stays mounted across client-side
 * navigation, so the in-flight request — and its result — survive the user
 * changing pages or doing something else.
 *
 * Note: a full page reload / tab close still tears down the browser context
 * and the client fetch with it. The server keeps running and saves the
 * balade as a draft regardless, so it is recoverable from the Historique.
 * We surface that on reload via the `detached` status.
 */

export type GenerationStatus =
  | 'idle'
  | 'running'
  | 'done'
  | 'error'
  | 'detached'

export interface GenerationJob {
  status: GenerationStatus
  /** Short human label for the running job, e.g. "Paris · difficile". */
  label: string
  startedAt: number
  baladeId?: string
  error?: string
}

interface GenerationContextValue {
  job: GenerationJob | null
  /** Kicks off a background generation. Refused if one is already running. */
  start: (payload: GenerationRequest) => boolean
  /** Clears a finished / errored / detached job. */
  dismiss: () => void
  isRunning: boolean
}

const GenerationContext = createContext<GenerationContextValue | null>(null)

const STORAGE_KEY = 'balade:generation-job'

function labelFor(payload: GenerationRequest): string {
  return `${payload.city || 'Balade'} · ${payload.difficulty}`
}

export function GenerationProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [job, setJob] = useState<GenerationJob | null>(null)
  // Guards against starting a second job while one is in flight, without
  // waiting for the async setJob to land.
  const runningRef = useRef(false)

  // Hydrate from localStorage on mount. A job persisted as `running` means the
  // page was reloaded mid-generation: the fetch is gone but the server likely
  // finished and saved a draft, so we flag it `detached` for the indicator.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY)
      if (!raw) return
      const saved = JSON.parse(raw) as GenerationJob
      if (saved.status === 'running') {
        setJob({ ...saved, status: 'detached' })
      } else if (saved.status === 'done' || saved.status === 'error') {
        setJob(saved)
      }
    } catch {
      // Corrupt entry — ignore.
    }
  }, [])

  // Mirror the job to localStorage so it survives a remount.
  useEffect(() => {
    try {
      if (job) localStorage.setItem(STORAGE_KEY, JSON.stringify(job))
      else localStorage.removeItem(STORAGE_KEY)
    } catch {
      // Storage unavailable (private mode, quota) — non-fatal.
    }
  }, [job])

  const start = useCallback((payload: GenerationRequest): boolean => {
    if (runningRef.current) return false
    runningRef.current = true
    setJob({
      status: 'running',
      label: labelFor(payload),
      startedAt: Date.now(),
    })

    void (async () => {
      try {
        const res = await fetch('/api/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        })
        const data = await res.json().catch(() => null)
        if (!res.ok || !data?.balade_id) {
          setJob((prev) =>
            prev
              ? {
                  ...prev,
                  status: 'error',
                  error: data?.error ?? 'La génération a échoué.',
                }
              : prev,
          )
          return
        }
        setJob((prev) =>
          prev
            ? { ...prev, status: 'done', baladeId: data.balade_id as string }
            : prev,
        )
      } catch {
        setJob((prev) =>
          prev
            ? {
                ...prev,
                status: 'error',
                error: 'Erreur réseau. Vérifie ta connexion.',
              }
            : prev,
        )
      } finally {
        runningRef.current = false
      }
    })()

    return true
  }, [])

  const dismiss = useCallback(() => {
    if (runningRef.current) return
    setJob(null)
  }, [])

  return (
    <GenerationContext.Provider
      value={{ job, start, dismiss, isRunning: job?.status === 'running' }}
    >
      {children}
    </GenerationContext.Provider>
  )
}

export function useGeneration(): GenerationContextValue {
  const ctx = useContext(GenerationContext)
  if (!ctx) {
    throw new Error('useGeneration must be used within a GenerationProvider')
  }
  return ctx
}
