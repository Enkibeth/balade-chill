import { createClient } from '@/lib/supabase/server'
import { getBaladesByUser, getUserSettings } from '@/lib/supabase/queries'
import { DashboardView } from './DashboardView'
import type { GlobeBalade } from '@/components/map/BaladeGlobe'

export const dynamic = 'force-dynamic'

interface SessionRow {
  balade_id: string
  total_score: number
  enigme_scores: Record<string, boolean> | null
  medical_scores: Record<string, boolean> | null
  mission_scores: Record<string, boolean> | null
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

  const bestScore = new Map<string, number>()
  for (const s of sessions) {
    if (s.total_score > (bestScore.get(s.balade_id) ?? 0)) {
      bestScore.set(s.balade_id, s.total_score)
    }
  }

  const items: GlobeBalade[] = balades.map((balade) => ({
    balade,
    score: bestScore.get(balade.id) ?? 0,
    date: balade.created_at,
    progress: (() => {
      const s = sessions.find((x) => x.balade_id === balade.id)
      const enigmesTotal = balade.etapes.length
      const medicineTotal = balade.etapes.filter((e) => e.medical_bonus).length
      const missionsTotal = balade.etapes.length
      return {
        enigmesDone: Object.keys(s?.enigme_scores ?? {}).length,
        enigmesTotal,
        medicineDone: Object.keys(s?.medical_scores ?? {}).length,
        medicineTotal,
        missionsDone: Object.keys(s?.mission_scores ?? {}).length,
        missionsTotal,
      }
    })(),
  }))

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
