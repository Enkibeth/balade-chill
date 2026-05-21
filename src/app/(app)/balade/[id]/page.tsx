import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBaladeById, getSessionForUser } from '@/lib/supabase/queries'
import { BaladeRunner } from '@/components/balade/BaladeRunner'

export const dynamic = 'force-dynamic'

export default async function BaladePage({
  params,
}: {
  params: { id: string }
  searchParams: { mode?: string }
}) {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) notFound()

  const balade = await getBaladeById(supabase, params.id)
  if (!balade) notFound()

  const session = await getSessionForUser(supabase, balade.id, user.id)

  return (
    <BaladeRunner balade={balade} userId={user.id} initialSession={session} />
  )
}
