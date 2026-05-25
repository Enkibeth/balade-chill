'use client'

import { useEffect, useMemo, useState } from 'react'
import { Flag, Cloud, CloudOff } from 'lucide-react'
import { useBaladeSession } from '@/hooks/useBaladeSession'
import { OfflineDownloadButton } from '@/components/offline/OfflineDownloadButton'
import { EtapeCard } from './EtapeCard'
import { ScoreSummary } from './ScoreSummary'
import type { Balade, BaladeSession } from '@/types'

export function BaladeRunner({
  balade,
  userId,
  initialSession,
}: {
  balade: Balade
  userId: string
  initialSession: BaladeSession | null
}) {
  const {
    session,
    synced,
    totalScore,
    maxScore,
    toggleEnigme,
    toggleMedical,
    toggleMission,
    setCurrentEtape,
    complete,
  } = useBaladeSession(balade, userId, initialSession)

  const etapes = useMemo(
    () => [...balade.etapes].sort((a, b) => a.order - b.order),
    [balade.etapes],
  )

  const [finished, setFinished] = useState(!!initialSession?.completed_at)
  const [activeOrder, setActiveOrder] = useState(etapes[0]?.order ?? 1)
  const theme = balade.theme_color

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            const order = Number(
              (entry.target as HTMLElement).dataset.order,
            )
            setActiveOrder(order)
            setCurrentEtape(order)
          }
        }
      },
      { threshold: 0.4 },
    )
    for (const e of etapes) {
      const el = document.getElementById(`etape-${e.order}`)
      if (el) {
        el.dataset.order = String(e.order)
        observer.observe(el)
      }
    }
    return () => observer.disconnect()
  }, [etapes, setCurrentEtape])

  function scrollToEtape(order: number) {
    document
      .getElementById(`etape-${order}`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  function handleFinish() {
    complete()
    setFinished(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  if (finished) {
    return (
      <ScoreSummary
        balade={balade}
        session={session}
        totalScore={totalScore}
        maxScore={maxScore}
      />
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5">
      {/* Cover */}
      <header
        className="rounded-2xl border p-6 text-center"
        style={{ borderColor: theme.secondary }}
      >
        <p className="text-[10px] uppercase tracking-[0.3em] text-amber-100/40">
          {balade.city} · {balade.country}
        </p>
        <h1
          className="my-2 text-3xl italic"
          style={{ color: theme.secondary }}
        >
          {balade.title}
        </h1>
        <p className="text-xs text-amber-100/45">
          {etapes.length} étapes · ~{Math.round(balade.estimated_duration_min)} min
          · {balade.distance_km} km
        </p>
        <div className="mt-4 flex justify-center">
          <OfflineDownloadButton balade={balade} />
        </div>
      </header>

      {balade.prologue && (
        <div
          className="rounded-2xl border-l-2 bg-black/30 p-5 text-sm italic leading-relaxed text-amber-100/75"
          style={{ borderColor: theme.primary }}
        >
          {balade.prologue}
        </div>
      )}

      {/* Progress dots */}
      <div className="sticky top-16 z-30 flex items-center gap-1.5 rounded-xl border border-amber-200/12 bg-[#1a0f08]/90 p-3 backdrop-blur">
        {etapes.map((e, i) => (
          <div key={e.id} className="flex flex-1 items-center gap-1.5">
            <button
              onClick={() => scrollToEtape(e.order)}
              className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border text-[11px] transition"
              style={{
                backgroundColor:
                  e.order === activeOrder ? theme.primary : 'transparent',
                borderColor:
                  e.order <= activeOrder ? theme.primary : 'rgba(243,231,211,0.2)',
                color:
                  e.order === activeOrder ? '#fff' : 'rgba(243,231,211,0.5)',
              }}
            >
              {e.order}
            </button>
            {i < etapes.length - 1 && (
              <span className="h-px flex-1 bg-amber-200/15" />
            )}
          </div>
        ))}
        <span className="ml-1 shrink-0" title={synced ? 'Synchronisé' : 'Sauvegarde…'}>
          {synced ? (
            <Cloud size={15} className="text-emerald-400/60" />
          ) : (
            <CloudOff size={15} className="text-amber-300/60" />
          )}
        </span>
      </div>

      {etapes.map((etape) => (
        <EtapeCard
          key={etape.id}
          etape={etape}
          theme={theme}
          enigmeSolved={!!session.enigme_scores[etape.enigme.id]}
          medicalCorrect={
            !!etape.medical_bonus &&
            !!session.medical_scores[etape.medical_bonus.id]
          }
          missionDone={!!session.mission_scores[etape.id]}
          onToggleEnigme={() => toggleEnigme(etape.enigme.id)}
          onToggleMedical={() =>
            etape.medical_bonus && toggleMedical(etape.medical_bonus.id)
          }
          onToggleMission={() => toggleMission(etape.id)}
        />
      ))}

      {balade.epilogue && (
        <div className="rounded-2xl bg-black/40 p-6 text-center text-sm italic leading-relaxed text-amber-100/70">
          {balade.epilogue}
        </div>
      )}

      <div className="rounded-2xl border border-amber-200/12 bg-black/30 p-5 text-center">
        <p className="mb-3 text-sm text-amber-100/55">
          Score actuel : {totalScore} / {maxScore}
        </p>
        <button
          onClick={handleFinish}
          className="inline-flex items-center gap-2 rounded-lg bg-amber-300 px-6 py-2.5 text-sm font-medium text-amber-950 transition hover:bg-amber-200"
        >
          <Flag size={16} /> Terminer l&apos;aventure
        </button>
      </div>
    </div>
  )
}
