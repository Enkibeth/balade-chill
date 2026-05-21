'use client'

import Link from 'next/link'
import { useState } from 'react'
import { Share2, Home, Trophy } from 'lucide-react'
import type { Balade, BaladeSession } from '@/types'

function countTrue(map: Record<string, boolean>): number {
  return Object.values(map).filter(Boolean).length
}

export function ScoreSummary({
  balade,
  session,
  totalScore,
  maxScore,
}: {
  balade: Balade
  session: BaladeSession
  totalScore: number
  maxScore: number
}) {
  const [shared, setShared] = useState(false)

  const nbEtapes = balade.etapes.length
  const nbMedical = balade.etapes.filter((e) => e.medical_bonus).length
  const enigmes = countTrue(session.enigme_scores)
  const medical = countTrue(session.medical_scores)
  const missions = countTrue(session.mission_scores)
  const percent = maxScore > 0 ? Math.round((totalScore / maxScore) * 100) : 0

  async function handleShare() {
    const text = `J'ai terminé "${balade.title}" à ${balade.city} — score ${totalScore}/${maxScore} !`
    try {
      if (navigator.share) {
        await navigator.share({ title: balade.title, text })
      } else {
        await navigator.clipboard.writeText(text)
      }
      setShared(true)
    } catch {
      /* user cancelled the share sheet */
    }
  }

  return (
    <div className="mx-auto max-w-md text-center">
      <div
        className="rounded-2xl border p-8"
        style={{ borderColor: balade.theme_color.secondary }}
      >
        <Trophy
          size={40}
          className="mx-auto mb-3"
          style={{ color: balade.theme_color.secondary }}
        />
        <h2 className="font-mono text-xl tracking-[0.15em] text-amber-100">
          AVENTURE TERMINÉE
        </h2>
        <p className="mt-1 text-sm text-amber-100/45">{balade.title}</p>

        <p
          className="my-5 text-5xl font-bold"
          style={{ color: balade.theme_color.secondary }}
        >
          {totalScore}
          <span className="text-2xl text-amber-100/30">/{maxScore}</span>
        </p>
        <p className="mb-5 text-sm text-amber-100/50">{percent}% de réussite</p>

        <dl className="space-y-2 text-sm">
          <ScoreRow label="Énigmes résolues sans indice" value={`${enigmes}/${nbEtapes}`} />
          <ScoreRow label="Questions médicales" value={`${medical}/${nbMedical}`} />
          <ScoreRow label="Missions accomplies" value={`${missions}/${nbEtapes}`} />
        </dl>

        <div className="mt-6 flex flex-col gap-2">
          <button
            onClick={handleShare}
            className="flex items-center justify-center gap-2 rounded-lg border border-amber-200/20 px-4 py-2.5 text-sm text-amber-100/80 transition hover:border-amber-200/40"
          >
            <Share2 size={15} />
            {shared ? 'Score copié !' : 'Partager le score'}
          </button>
          <Link
            href="/dashboard"
            className="flex items-center justify-center gap-2 rounded-lg bg-amber-300 px-4 py-2.5 text-sm font-medium text-amber-950 transition hover:bg-amber-200"
          >
            <Home size={15} /> Retour à la carte
          </Link>
        </div>
      </div>
    </div>
  )
}

function ScoreRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-amber-200/10 pb-2">
      <dt className="text-amber-100/50">{label}</dt>
      <dd className="text-amber-100">{value}</dd>
    </div>
  )
}
