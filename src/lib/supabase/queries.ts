import type { SupabaseClient } from '@supabase/supabase-js'
import type { Balade, BaladeSession, UserSettings } from '@/types'
import type {
  GeneratedParcours,
  ParcoursRecord,
} from '@/lib/ai/parcours/types'

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
      id: balade.id,
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

/** Reads the caller's settings row (provider, model, keys). */
export async function getUserSettings(
  supabase: SupabaseClient,
  userId: string,
): Promise<UserSettings | null> {
  const { data, error } = await supabase
    .from('user_settings')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw error
  return (data as UserSettings) ?? null
}

export type UserSettingsUpdate = Partial<
  Pick<
    UserSettings,
    | 'ai_provider'
    | 'ai_model'
    | 'ai_api_key'
    | 'mapbox_token'
    | 'generation_pipeline'
  >
> & { user_id: string }

/** Inserts or updates the caller's settings row. */
export async function upsertUserSettings(
  supabase: SupabaseClient,
  settings: UserSettingsUpdate,
): Promise<UserSettings> {
  const { data, error } = await supabase
    .from('user_settings')
    .upsert({ ...settings, updated_at: new Date().toISOString() })
    .select('*')
    .single()
  if (error) throw error
  return data as UserSettings
}

// ---------- Parcours (visite mode) ----------

const PARCOURS_COLUMNS =
  'id,created_at,title,city,country,intro,stops,google_maps_urls,unresolved,' +
  'distance_km,estimated_duration_min,is_loop,html'

/** Maps a DB row into the ParcoursRecord shape the client uses. */
function rowToParcoursRecord(row: Record<string, unknown>): ParcoursRecord {
  return {
    id: String(row.id),
    created_at: String(row.created_at),
    title: String(row.title ?? ''),
    intro: String(row.intro ?? ''),
    city: String(row.city ?? ''),
    country: String(row.country ?? ''),
    stops: (row.stops as ParcoursRecord['stops']) ?? [],
    google_maps_urls: (row.google_maps_urls as string[]) ?? [],
    unresolved: (row.unresolved as string[]) ?? [],
    distance_km: Number(row.distance_km ?? 0),
    estimated_duration_min: Number(row.estimated_duration_min ?? 0),
    is_loop: Boolean(row.is_loop),
    html: String(row.html ?? ''),
  }
}

/** Inserts a generated parcours for a user; returns the stored record. */
export async function saveParcours(
  supabase: SupabaseClient,
  parcours: GeneratedParcours,
  html: string,
  userId: string,
): Promise<ParcoursRecord> {
  const { data, error } = await supabase
    .from('parcours')
    .insert({
      created_by: userId,
      title: parcours.title,
      city: parcours.city,
      country: parcours.country,
      intro: parcours.intro,
      stops: parcours.stops,
      google_maps_urls: parcours.google_maps_urls,
      unresolved: parcours.unresolved,
      distance_km: parcours.distance_km,
      estimated_duration_min: parcours.estimated_duration_min,
      is_loop: parcours.is_loop,
      html,
    })
    .select(PARCOURS_COLUMNS)
    .single()
  if (error) throw error
  return rowToParcoursRecord(data as unknown as Record<string, unknown>)
}

/** All parcours visible to a user (own + partner's), newest first. */
export async function getParcoursByUser(
  supabase: SupabaseClient,
  userId: string,
): Promise<ParcoursRecord[]> {
  const { data, error } = await supabase
    .from('parcours')
    .select(PARCOURS_COLUMNS)
    .order('created_at', { ascending: false })
  if (error) throw error
  void userId // visibility is enforced by RLS (own + partner)
  return (data ?? []).map((r) =>
    rowToParcoursRecord(r as unknown as Record<string, unknown>),
  )
}

/** Deletes one of the caller's parcours (RLS restricts to own rows). */
export async function deleteParcours(
  supabase: SupabaseClient,
  id: string,
): Promise<void> {
  const { error } = await supabase.from('parcours').delete().eq('id', id)
  if (error) throw error
}
