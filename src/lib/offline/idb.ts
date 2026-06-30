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
