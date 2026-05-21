import type { SupabaseClient } from '@supabase/supabase-js'
import type { Balade, BaladeSession } from '@/types'

/** A session payload for upsert — id/timestamps are filled by the DB. */
export type SessionUpsert = Partial<BaladeSession> & {
  balade_id: string
  user_id: string
}

const BALADE_COLUMNS =
  'id,title,city,country,theme_color,difficulty,status,created_by,created_at,' +
  'estimated_duration_min,distance_km,html_content,etapes,medical_specs,' +
  'story_context,prologue,epilogue,centroid_lat,centroid_lng'

function centroid(balade: Balade): { lat: number | null; lng: number | null } {
  const lats = balade.etapes.map((e) => e.lat).filter((n) => Number.isFinite(n))
  const lngs = balade.etapes.map((e) => e.lng).filter((n) => Number.isFinite(n))
  return {
    lat: lats.length ? lats.reduce((a, b) => a + b, 0) / lats.length : null,
    lng: lngs.length ? lngs.reduce((a, b) => a + b, 0) / lngs.length : null,
  }
}

/** All balades created by a user, newest first. */
export async function getBaladesByUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<Balade[]> {
  const { data, error } = await supabase
    .from('balades')
    .select(BALADE_COLUMNS)
    .eq('created_by', userId)
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data ?? []) as unknown as Balade[]
}

/** A single balade by id, or null if not found / not visible. */
export async function getBaladeById(
  supabase: SupabaseClient,
  id: string,
): Promise<Balade | null> {
  const { data, error } = await supabase
    .from('balades')
    .select(BALADE_COLUMNS)
    .eq('id', id)
    .maybeSingle()
  if (error) throw error
  return (data as unknown as Balade) ?? null
}

/** Insert a freshly generated balade, returning its new id. */
export async function saveGeneratedBalade(
  supabase: SupabaseClient,
  balade: Balade,
): Promise<string> {
  const { lat, lng } = centroid(balade)
  const { data, error } = await supabase
    .from('balades')
    .insert({
      title: balade.title,
      city: balade.city,
      country: balade.country,
      theme_color: balade.theme_color,
      difficulty: balade.difficulty,
      status: balade.status,
      created_by: balade.created_by,
      estimated_duration_min: balade.estimated_duration_min,
      distance_km: balade.distance_km,
      html_content: balade.html_content,
      etapes: balade.etapes,
      medical_specs: balade.medical_specs,
      story_context: balade.story_context,
      prologue: balade.prologue,
      epilogue: balade.epilogue,
      centroid_lat: lat,
      centroid_lng: lng,
    })
    .select('id')
    .single()
  if (error) throw error
  return (data as { id: string }).id
}

/** Create or update the caller's session for a balade. */
export async function upsertSession(
  supabase: SupabaseClient,
  session: SessionUpsert,
): Promise<BaladeSession> {
  const { data, error } = await supabase
    .from('balade_sessions')
    .upsert(session, { onConflict: 'balade_id,user_id' })
    .select('*')
    .single()
  if (error) throw error
  return data as BaladeSession
}

/** All sessions recorded against a balade (caller + partner). */
export async function getSessionsByBalade(
  supabase: SupabaseClient,
  baladeId: string,
): Promise<BaladeSession[]> {
  const { data, error } = await supabase
    .from('balade_sessions')
    .select('*')
    .eq('balade_id', baladeId)
  if (error) throw error
  return (data ?? []) as BaladeSession[]
}

/** The caller's own session for a balade, if one exists. */
export async function getSessionForUser(
  supabase: SupabaseClient,
  baladeId: string,
  userId: string,
): Promise<BaladeSession | null> {
  const { data, error } = await supabase
    .from('balade_sessions')
    .select('*')
    .eq('balade_id', baladeId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as BaladeSession) ?? null
}
