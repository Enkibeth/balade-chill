import { notFound } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import {
  getBaladeById,
  getSessionForUser,
  getUserSettings,
} from '@/lib/supabase/queries'
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

  // A draft balade must be validated first; ?mode=preview forces the screen.
  if (balade.status === 'draft' || searchParams.mode === 'preview') {
    const settings = await getUserSettings(supabase, user.id)
    return (
      <ValidationScreen
        balade={balade}
        mapboxToken={
          settings?.mapbox_token ??
          process.env.NEXT_PUBLIC_MAPBOX_TOKEN ??
          null
        }
      />
    )
  }

  const session = await getSessionForUser(supabase, balade.id, user.id)
  return (
    <BaladeRunner balade={balade} userId={user.id} initialSession={session} />
  )
}
