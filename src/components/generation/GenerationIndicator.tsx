'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Loader2, Check, X, AlertTriangle, History } from 'lucide-react'
import { useGeneration } from './GenerationProvider'

/**
 * Floating, always-visible status for the background generation. Lives in the
 * (app) layout so it shows on every page while a balade is being generated,
 * and offers a link to the result when it's done.
 */
export function GenerationIndicator() {
  const { job, dismiss } = useGeneration()
  const [elapsed, setElapsed] = useState(0)

  const running = job?.status === 'running'

  useEffect(() => {
    if (!running) return
    setElapsed(Math.floor((Date.now() - (job?.startedAt ?? Date.now())) / 1000))
    const t = setInterval(() => {
      setElapsed(Math.floor((Date.now() - (job?.startedAt ?? Date.now())) / 1000))
    }, 1000)
    return () => clearInterval(t)
  }, [running, job?.startedAt])

  if (!job) return null

  return (
    <div className="fixed bottom-4 right-4 z-50 w-[19rem] max-w-[calc(100vw-2rem)] rounded-xl border border-amber-200/20 bg-[#1a0f08]/95 p-4 shadow-xl shadow-black/40 backdrop-blur">
      {job.status === 'running' && (
        <div className="flex items-start gap-3">
          <Loader2 size={18} className="mt-0.5 shrink-0 animate-spin text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="flex items-center justify-between gap-2 text-sm text-amber-100">
              <span className="truncate">Génération en cours…</span>
              <span className="shrink-0 font-mono text-xs text-amber-100/40">
                {elapsed}s
              </span>
            </p>
            <p className="mt-0.5 truncate text-xs text-amber-100/45">
              {job.label}
            </p>
            <p className="mt-1.5 text-[11px] text-amber-100/35">
              Tu peux changer de page, ça continue en arrière-plan.
            </p>
          </div>
        </div>
      )}

      {job.status === 'done' && (
        <div className="flex items-start gap-3">
          <Check size={18} className="mt-0.5 shrink-0 text-emerald-400" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-amber-100">Balade prête !</p>
            <p className="mt-0.5 truncate text-xs text-amber-100/45">
              {job.label}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Link
                href={`/balade/${job.baladeId}?mode=preview`}
                onClick={dismiss}
                className="rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-amber-200"
              >
                Voir la balade
              </Link>
              <button
                onClick={dismiss}
                className="rounded-lg px-2 py-1.5 text-xs text-amber-100/45 transition hover:text-amber-100"
              >
                Plus tard
              </button>
            </div>
          </div>
        </div>
      )}

      {job.status === 'error' && (
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} className="mt-0.5 shrink-0 text-rose-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-amber-100">Génération échouée</p>
            <p className="mt-0.5 text-xs text-rose-200/70">{job.error}</p>
            <button
              onClick={dismiss}
              className="mt-2 rounded-lg border border-amber-200/20 px-3 py-1.5 text-xs text-amber-100/70 transition hover:border-amber-200/40"
            >
              Fermer
            </button>
          </div>
        </div>
      )}

      {job.status === 'detached' && (
        <div className="flex items-start gap-3">
          <History size={18} className="mt-0.5 shrink-0 text-amber-300" />
          <div className="min-w-0 flex-1">
            <p className="text-sm text-amber-100">Génération interrompue ?</p>
            <p className="mt-0.5 text-xs text-amber-100/55">
              La page a été rechargée. La balade a peut-être été créée — vérifie
              ton historique.
            </p>
            <div className="mt-2 flex items-center gap-2">
              <Link
                href="/history"
                onClick={dismiss}
                className="rounded-lg bg-amber-300 px-3 py-1.5 text-xs font-medium text-amber-950 transition hover:bg-amber-200"
              >
                Historique
              </Link>
              <button
                onClick={dismiss}
                className="rounded-lg px-2 py-1.5 text-xs text-amber-100/45 transition hover:text-amber-100"
              >
                Ignorer
              </button>
            </div>
          </div>
        </div>
      )}

      {(job.status === 'done' || job.status === 'error') && (
        <button
          onClick={dismiss}
          aria-label="Fermer"
          className="absolute right-2 top-2 text-amber-100/30 transition hover:text-amber-100/70"
        >
          <X size={14} />
        </button>
      )}
    </div>
  )
}
