import { createClient } from '@/lib/supabase/server'
import { getUserSettings } from '@/lib/supabase/queries'
import { SettingsForm } from './SettingsForm'

export const dynamic = 'force-dynamic'

export default async function SettingsPage() {
  const supabase = createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const settings = await getUserSettings(supabase, user.id)

  return (
    <div className="mx-auto max-w-lg">
      <h1 className="mb-1 font-mono text-xl tracking-[0.18em] text-amber-200">
        RÉGLAGES
      </h1>
      <p className="mb-6 text-sm text-amber-100/45">
        Clés API personnelles — stockées avec un accès restreint à ton compte.
      </p>
      <SettingsForm userId={user.id} initial={settings} />
    </div>
  )
}
