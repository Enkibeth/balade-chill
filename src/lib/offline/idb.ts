import { openDB, type IDBPDatabase } from 'idb'
import type { Balade, BaladeSession } from '@/types'
import type { ParcoursRecord } from '@/lib/ai/parcours/types'

const DB_NAME = 'balades-offline'
// v2 adds the "parcours" store (visite mode). The upgrade only creates stores
// that don't exist yet, so bumping the version is safe for existing users.
const DB_VERSION = 2

/**
 * A parcours mirrored locally for offline access. Same shape as the server
 * record (ParcoursRecord): the rendered HTML lets it reopen without a network
 * call; the id/timestamp drive the "Mes parcours" list.
 */
export type SavedParcours = ParcoursRecord

/** Object stores: full balades, latest session per balade, a queue of score
 *  updates awaiting sync, and locally-saved parcours. */
let dbPromise: Promise<IDBPDatabase> | null = null

function getDb(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains('balades')) {
          db.createObjectStore('balades', { keyPath: 'id' })
        }
        if (!db.objectStoreNames.contains('sessions')) {
          db.createObjectStore('sessions', { keyPath: 'balade_id' })
        }
        if (!db.objectStoreNames.contains('pending_scores')) {
          db.createObjectStore('pending_scores', { keyPath: 'balade_id' })
        }
        if (!db.objectStoreNames.contains('parcours')) {
          db.createObjectStore('parcours', { keyPath: 'id' })
        }
      },
    })
  }
  return dbPromise
}

/** Stores a full balade (including html_content) for offline access. */
export async function cacheBalade(balade: Balade): Promise<void> {
  await (await getDb()).put('balades', balade)
}

/** Mirrors the latest session for a balade locally. */
export async function cacheSession(session: BaladeSession): Promise<void> {
  await (await getDb()).put('sessions', session)
}

/** Queues a score update to be synced to Supabase on reconnect. */
export async function queuePendingScore(
  session: BaladeSession,
): Promise<void> {
  await (await getDb()).put('pending_scores', session)
}

export async function getPendingScores(): Promise<BaladeSession[]> {
  return (await getDb()).getAll('pending_scores') as Promise<BaladeSession[]>
}

export async function clearPendingScore(baladeId: string): Promise<void> {
  await (await getDb()).delete('pending_scores', baladeId)
}

/** Saves (or overwrites) a generated parcours locally. */
export async function saveParcours(parcours: SavedParcours): Promise<void> {
  await (await getDb()).put('parcours', parcours)
}

/** All locally-saved parcours, newest first. */
export async function listParcours(): Promise<SavedParcours[]> {
  const all = (await (await getDb()).getAll('parcours')) as SavedParcours[]
  return all.sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
}

export async function getParcours(id: string): Promise<SavedParcours | null> {
  return ((await (await getDb()).get('parcours', id)) as SavedParcours) ?? null
}

export async function deleteParcours(id: string): Promise<void> {
  await (await getDb()).delete('parcours', id)
}
