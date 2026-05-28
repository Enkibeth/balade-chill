import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getBaladeById, getSessionForUser } from '@/lib/supabase/queries'
import { BaladeRunner } from '@/components/balade/BaladeRunner'
import { ValidationScreen } from '@/components/balade/ValidationScreen'

export const dynamic = 'force-dynamic'

export default async function BaladePage({
  params,
  searchParams,
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

  // A draft balade must be validated first; ?mode=preview|edit opens the editor
  // for an already-saved balade so its étapes can be tweaked after generation.
  const editing = balade.status !== 'draft'
  if (
    balade.status === 'draft' ||
    searchParams.mode === 'preview' ||
    searchParams.mode === 'edit'
  ) {
    return <ValidationScreen balade={balade} editing={editing} />
  }

  const session = await getSessionForUser(supabase, balade.id, user.id)
  return (
    <BaladeRunner balade={balade} userId={user.id} initialSession={session} />
  )
}
