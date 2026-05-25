import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getBaladesByUser } from '@/lib/supabase/queries'

export const dynamic = 'force-dynamic'

const DIFF_LABEL: Record<string, string> = {
  facile: 'Facile',
  moyen: 'Moyen',
  difficile: 'Difficile',
  boss: 'Boss',
}
const STATUS_LABEL: Record<string, string> = {
  draft: 'Brouillon',
  validated: 'Validée',
  completed: 'Terminée',
  archived: 'Archivée',
}

interface SessionRow {
  balade_id: string
  total_score: number
  completed_at: string | null
}

export default async function HistoryPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const balades = await getBaladesByUser(supabase, user.id)
  const { data: sessionData } = await supabase
    .from('balade_sessions')
    .select('balade_id,total_score,completed_at')
    .eq('user_id', user.id)
  const sessions = (sessionData ?? []) as SessionRow[]

  const byBalade = new Map<string, { score: number; done: boolean }>()
  for (const s of sessions) {
    const prev = byBalade.get(s.balade_id)
    byBalade.set(s.balade_id, {
      score: Math.max(prev?.score ?? 0, s.total_score),
      done: (prev?.done ?? false) || s.completed_at != null,
    })
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-4 font-mono text-xl tracking-[0.2em] text-amber-200">
        HISTORIQUE
      </h1>

      {balades.length === 0 && (
        <div className="rounded-2xl border border-amber-200/12 bg-black/30 p-8 text-center">
          <p className="text-sm text-amber-100/50">
            Aucune balade générée pour l&apos;instant.
          </p>
          <Link
            href="/generate"
            className="mt-3 inline-block rounded-lg bg-amber-300 px-4 py-2 text-sm font-medium text-amber-950"
          >
            Générer une balade
          </Link>
        </div>
      )}

      <div className="space-y-2">
        {balades.map((b) => {
          const stats = byBalade.get(b.id)
          return (
            <Link
              key={b.id}
              href={`/balade/${b.id}`}
              className="block rounded-xl border border-amber-200/12 bg-black/30 p-4 transition hover:border-amber-200/25"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span
                    className="h-3 w-3 shrink-0 rounded-full"
                    style={{ backgroundColor: b.theme_color.primary }}
                  />
                  <span className="text-sm text-amber-100">{b.title}</span>
                </div>
                {stats && (
                  <span
                    className="shrink-0 rounded-full px-2 py-0.5 text-[10px] text-amber-950"
                    style={{ backgroundColor: b.theme_color.secondary }}
                  >
                    {stats.score} pts
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[11px] text-amber-100/40">
                <span>{b.city}</span>
                <span>·</span>
                <span>{new Date(b.created_at).toLocaleDateString('fr-FR')}</span>
                <span>·</span>
                <span>{DIFF_LABEL[b.difficulty] ?? b.difficulty}</span>
                <span>·</span>
                <span
                  className={
                    stats?.done || b.status === 'completed'
                      ? 'text-emerald-300/70'
                      : 'text-amber-100/40'
                  }
                >
                  {stats?.done ? 'Terminée' : STATUS_LABEL[b.status] ?? b.status}
                </span>
              </div>
            </Link>
          )
        })}
      </div>
    </div>
  )
}
