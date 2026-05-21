import { openDB, type IDBPDatabase } from 'idb'
import type { Balade, BaladeSession } from '@/types'

const DB_NAME = 'balades-offline'
const DB_VERSION = 1

/** Object stores: full balades, latest session per balade, and a queue of
 *  score updates awaiting sync when the network comes back. */
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
      },
    })
  }
  return dbPromise
}

/** Stores a full balade (including html_content) for offline access. */
export async function cacheBalade(balade: Balade): Promise<void> {
  await (await getDb()).put('balades', balade)
}

export async function getCachedBalade(
  id: string,
): Promise<Balade | undefined> {
  return (await getDb()).get('balades', id) as Promise<Balade | undefined>
}

export async function getCachedBalades(): Promise<Balade[]> {
  return (await getDb()).getAll('balades') as Promise<Balade[]>
}

/** Mirrors the latest session for a balade locally. */
export async function cacheSession(session: BaladeSession): Promise<void> {
  await (await getDb()).put('sessions', session)
}

export async function getCachedSession(
  baladeId: string,
): Promise<BaladeSession | undefined> {
  return (await getDb()).get('sessions', baladeId) as Promise<
    BaladeSession | undefined
  >
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
