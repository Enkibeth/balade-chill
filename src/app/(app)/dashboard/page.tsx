import { createClient } from '@/lib/supabase/server'
import { getBaladesByUser, getUserSettings } from '@/lib/supabase/queries'
import { DashboardView } from './DashboardView'
import type { GlobeBalade } from '@/components/map/BaladeGlobe'

export const dynamic = 'force-dynamic'

type ScoreMap = Record<string, boolean>

interface SessionRow {
  balade_id: string
  total_score: number
  enigme_scores: ScoreMap
  medical_scores: ScoreMap
  mission_scores: ScoreMap
}

function countTrue(map: ScoreMap | null | undefined): number {
  return map ? Object.values(map).filter(Boolean).length : 0
}

export default async function DashboardPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const [balades, settings] = await Promise.all([
    getBaladesByUser(supabase, user.id),
    getUserSettings(supabase, user.id),
  ])

  const { data: sessionData } = await supabase
    .from('balade_sessions')
    .select('balade_id,total_score,enigme_scores,medical_scores,mission_scores')
    .eq('user_id', user.id)
  const sessions = (sessionData ?? []) as SessionRow[]

  const sessionByBalade = new Map<string, SessionRow>()
  for (const s of sessions) {
    const prev = sessionByBalade.get(s.balade_id)
    if (!prev || s.total_score > prev.total_score) {
      sessionByBalade.set(s.balade_id, s)
    }
  }

  const items: GlobeBalade[] = balades.map((balade) => {
    const session = sessionByBalade.get(balade.id)
    const medicalTotal = balade.etapes.filter((e) => e.medical_bonus).length
    return {
      balade,
      score: session?.total_score ?? 0,
      date: balade.created_at,
      progress: {
        enigmes: {
          done: countTrue(session?.enigme_scores),
          total: balade.etapes.length,
        },
        medical: {
          done: countTrue(session?.medical_scores),
          total: medicalTotal,
        },
        missions: {
          done: countTrue(session?.mission_scores),
          total: balade.etapes.length,
        },
      },
    }
  })

  return (
    <div>
      <h1 className="mb-4 font-mono text-xl tracking-[0.2em] text-amber-200">
        VOS BALADES
      </h1>
      <DashboardView
        items={items}
        mapboxToken={
          settings?.mapbox_token ??
          process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
          null
        }
      />
    </div>
  )
}
