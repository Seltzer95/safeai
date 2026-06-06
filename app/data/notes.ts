/**
 * Notes data layer — typed CRUD operations backed by IndexedDB.
 *
 * Pure functions with no React dependency; fully unit-testable.
 * Embedding is stored as a nullable Float32Array but is not computed here —
 * the calling layer (useNotes hook) handles embedding via the worker.
 */

import { getDb } from './db'

export interface Note {
  id: string
  title: string
  body: string
  /** 384-dim MiniLM embedding, null until first computed */
  embedding: Float32Array | null
  tags: string[]
  createdAt: Date
  updatedAt: Date
}

export type NoteInput = Pick<Note, 'title' | 'body' | 'tags'>
export type NoteUpdate = Partial<Pick<Note, 'title' | 'body' | 'tags' | 'embedding'>>

export async function createNote(input: NoteInput): Promise<Note> {
  const db = await getDb()
  const now = new Date()
  const note: Note = {
    id: crypto.randomUUID(),
    title: input.title,
    body: input.body,
    tags: input.tags ?? [],
    embedding: null,
    createdAt: now,
    updatedAt: now,
  }
  await db.put('notes', note)
  return note
}

export async function getNote(id: string): Promise<Note | undefined> {
  return (await getDb()).get('notes', id)
}

export async function updateNote(id: string, patch: NoteUpdate): Promise<Note> {
  const db = await getDb()
  const existing = await db.get('notes', id)
  if (!existing) throw new Error(`Note not found: ${id}`)
  const updated: Note = { ...existing, ...patch, id, updatedAt: new Date() }
  await db.put('notes', updated)
  return updated
}

export async function deleteNote(id: string): Promise<void> {
  return (await getDb()).delete('notes', id)
}

/** Returns all notes sorted newest-first by updatedAt. */
export async function listNotes(): Promise<Note[]> {
  const notes = await (await getDb()).getAll('notes')
  return notes.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime())
}
