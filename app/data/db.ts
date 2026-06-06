/**
 * Data layer — IndexedDB persistence.
 *
 * Placeholder: define stores here as features are built.
 * Each store should have its own typed helper exported from this file.
 */

const DB_NAME = 'safeai'
const DB_VERSION = 1

let _db: IDBDatabase | null = null

export function openDb(): Promise<IDBDatabase> {
  if (_db) return Promise.resolve(_db)

  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION)

    req.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result
      // Create object stores here as features are added.
      // Example:
      //   db.createObjectStore('documents', { keyPath: 'id' })
      void db
    }

    req.onsuccess = (event) => {
      _db = (event.target as IDBOpenDBRequest).result
      resolve(_db)
    }

    req.onerror = (event) => {
      reject((event.target as IDBOpenDBRequest).error)
    }
  })
}
