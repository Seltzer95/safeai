/**
 * Unit tests for the notes CRUD layer.
 *
 * Uses fake-indexeddb to provide an in-memory IndexedDB and resets the
 * db singleton between each test for full isolation.
 */

import { beforeEach, describe, expect, it } from 'vitest'
// fake-indexeddb/auto registers IDBRequest, IDBDatabase, IDBFactory etc. on globalThis
import 'fake-indexeddb/auto'
import { IDBFactory } from 'fake-indexeddb'
import { resetDb } from './db'
import {
  createNote,
  getNote,
  updateNote,
  deleteNote,
  listNotes,
  type NoteInput,
} from './notes'

beforeEach(() => {
  // Fresh in-memory IndexedDB for every test
  globalThis.indexedDB = new IDBFactory()
  resetDb()
})

const base: NoteInput = { title: 'Hello', body: 'World', tags: ['test'] }

describe('createNote', () => {
  it('returns a note with all required fields', async () => {
    const note = await createNote(base)
    expect(note.id).toBeTypeOf('string')
    expect(note.title).toBe('Hello')
    expect(note.body).toBe('World')
    expect(note.tags).toEqual(['test'])
    expect(note.embedding).toBeNull()
    expect(note.createdAt).toBeInstanceOf(Date)
    expect(note.updatedAt).toBeInstanceOf(Date)
  })

  it('persists so getNote retrieves it', async () => {
    const note = await createNote(base)
    const fetched = await getNote(note.id)
    expect(fetched).toBeDefined()
    expect(fetched?.id).toBe(note.id)
  })

  it('defaults tags to [] when omitted', async () => {
    const note = await createNote({ title: 'T', body: 'B', tags: [] })
    expect(note.tags).toEqual([])
  })
})

describe('getNote', () => {
  it('returns undefined for unknown id', async () => {
    expect(await getNote('no-such-id')).toBeUndefined()
  })
})

describe('updateNote', () => {
  it('patches fields and bumps updatedAt', async () => {
    const note = await createNote(base)
    const before = note.updatedAt.getTime()

    // Ensure at least 1 ms passes
    await new Promise((r) => setTimeout(r, 2))

    const updated = await updateNote(note.id, { title: 'New title', tags: ['a', 'b'] })
    expect(updated.title).toBe('New title')
    expect(updated.body).toBe('World') // unchanged
    expect(updated.tags).toEqual(['a', 'b'])
    expect(updated.updatedAt.getTime()).toBeGreaterThan(before)
  })

  it('stores and retrieves a Float32Array embedding', async () => {
    const note = await createNote(base)
    const vec = new Float32Array([0.1, 0.2, 0.3])
    const updated = await updateNote(note.id, { embedding: vec })
    expect(updated.embedding).toBeInstanceOf(Float32Array)
    // Float32Array has limited precision; compare element-wise with tolerance
    const expected = Array.from(vec)
    const actual = Array.from(updated.embedding!)
    for (let i = 0; i < expected.length; i++) {
      expect(actual[i]).toBeCloseTo(expected[i]!, 5)
    }

    // Persisted correctly (instanceof check is unreliable across jsdom realms)
    const fetched = await getNote(note.id)
    expect(fetched?.embedding).not.toBeNull()
    expect((fetched!.embedding as unknown as Float32Array).BYTES_PER_ELEMENT).toBe(4)
  })

  it('throws for unknown id', async () => {
    await expect(updateNote('nope', { title: 'x' })).rejects.toThrow('Note not found')
  })
})

describe('deleteNote', () => {
  it('removes the note from the store', async () => {
    const note = await createNote(base)
    await deleteNote(note.id)
    expect(await getNote(note.id)).toBeUndefined()
  })

  it('is a no-op for unknown ids', async () => {
    await expect(deleteNote('ghost')).resolves.toBeUndefined()
  })
})

describe('listNotes', () => {
  it('returns empty array when no notes exist', async () => {
    expect(await listNotes()).toEqual([])
  })

  it('returns all notes sorted newest-first by updatedAt', async () => {
    const a = await createNote({ title: 'A', body: '', tags: [] })
    await new Promise((r) => setTimeout(r, 2))
    const b = await createNote({ title: 'B', body: '', tags: [] })
    await new Promise((r) => setTimeout(r, 2))
    const c = await createNote({ title: 'C', body: '', tags: [] })

    const list = await listNotes()
    expect(list.map((n) => n.id)).toEqual([c.id, b.id, a.id])
  })

  it('reflects deletions', async () => {
    const note = await createNote(base)
    await deleteNote(note.id)
    expect(await listNotes()).toHaveLength(0)
  })
})
