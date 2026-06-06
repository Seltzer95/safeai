/**
 * IndexedDB singleton via the `idb` library.
 *
 * Add new object stores here when introducing new features.
 * Bump DB_VERSION and add an `if (oldVersion < N)` branch in `upgrade`.
 */

import { openDB, type DBSchema, type IDBPDatabase } from 'idb'
import type { Note } from './notes'

interface SafeAiDB extends DBSchema {
  notes: {
    key: string
    value: Note
    indexes: { 'by-updatedAt': Date }
  }
}

const DB_NAME = 'safeai'
const DB_VERSION = 2

let _dbPromise: Promise<IDBPDatabase<SafeAiDB>> | null = null

export function getDb(): Promise<IDBPDatabase<SafeAiDB>> {
  // Guard: IndexedDB is browser-only. If this fires during SSR it's a bug.
  if (typeof indexedDB === 'undefined') {
    const msg = '[db] getDb() called outside browser — IndexedDB unavailable (SSR bug?)'
    console.error(msg)
    return Promise.reject(new Error(msg))
  }

  if (_dbPromise) return _dbPromise

  _dbPromise = openDB<SafeAiDB>(DB_NAME, DB_VERSION, {
    upgrade(db, oldVersion) {
      if (oldVersion < 2) {
        const store = db.createObjectStore('notes', { keyPath: 'id' })
        store.createIndex('by-updatedAt', 'updatedAt')
      }
    },
  })

  return _dbPromise
}

/** Reset the DB singleton — for use in tests only. */
export function resetDb(): void {
  _dbPromise = null
}
