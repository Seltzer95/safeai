/**
 * useNotes — manages the notes list and CRUD actions.
 *
 * On every create/update the hook automatically triggers embedding via the
 * inference worker and stores the result.  While a note is being embedded,
 * its id appears in `embeddingIds` so the UI can show a subtle indicator.
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import {
  createNote as dbCreate,
  updateNote as dbUpdate,
  deleteNote as dbDelete,
  listNotes,
  type Note,
  type NoteInput,
  type NoteUpdate,
} from '~/data/notes'
import { useEmbedding, type EmbeddingStatus } from './useEmbedding'

export interface UseNotesReturn {
  notes: Note[]
  /** IDs of notes whose embedding is currently being computed */
  embeddingIds: Set<string>
  modelStatus: EmbeddingStatus
  /** Download/init progress 0–100 (only meaningful while status === 'loading') */
  modelProgress: number
  /** Last model error message, if any */
  modelError: string | null
  createNote: (input: NoteInput) => Promise<Note>
  updateNote: (id: string, patch: Omit<NoteUpdate, 'embedding'>) => Promise<Note>
  deleteNote: (id: string) => Promise<void>
  /** Seed the app with demo notes; also triggers embedding if model is ready */
  loadDemoNotes: () => Promise<void>
}

export function useNotes(): UseNotesReturn {
  const [notes, setNotes] = useState<Note[]>([])
  const [embeddingIds, setEmbeddingIds] = useState<Set<string>>(new Set())
  const { loadModel, embed, status: modelStatus, progress: modelProgress, error: modelError } = useEmbedding()
  const didInit = useRef(false)
  const modelStatusRef = useRef(modelStatus)
  modelStatusRef.current = modelStatus

  // Refs for stable access inside effects/callbacks without stale closures
  const notesRef = useRef<Note[]>(notes)
  notesRef.current = notes
  const embeddingIdsRef = useRef<Set<string>>(embeddingIds)
  embeddingIdsRef.current = embeddingIds

  const refresh = useCallback(async () => {
    setNotes(await listNotes())
  }, [])

  // Hydrate notes immediately; load model lazily after first paint
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    void refresh()
    // Defer model loading so notes render before the worker starts —
    // notes create/edit/delete are fully usable without waiting for the model.
    const timer = setTimeout(() => void loadModel(), 0)
    return () => clearTimeout(timer)
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Fire-and-forget: compute embedding for a note and persist it.
   *  Silently skips if the model is not yet ready to avoid unhandled errors on load. */
  const embedNote = useCallback(
    async (id: string, title: string, body: string) => {
      if (modelStatusRef.current !== 'ready') return
      setEmbeddingIds((prev) => new Set(prev).add(id))
      try {
        const vector = await embed(`${title}\n${body}`)
        await dbUpdate(id, { embedding: vector })
        await refresh()
      } finally {
        setEmbeddingIds((prev) => {
          const next = new Set(prev)
          next.delete(id)
          return next
        })
      }
    },
    [embed, refresh],
  )

  // When the model first becomes ready, catch up on any notes without embeddings.
  // This covers demo notes seeded before the model finished loading.
  useEffect(() => {
    if (modelStatus !== 'ready') return
    for (const note of notesRef.current) {
      if (!note.embedding && !embeddingIdsRef.current.has(note.id)) {
        void embedNote(note.id, note.title, note.body)
      }
    }
  }, [modelStatus, embedNote])

  const createNote = useCallback(
    async (input: NoteInput): Promise<Note> => {
      const note = await dbCreate(input)
      await refresh()
      void embedNote(note.id, note.title, note.body)
      return note
    },
    [refresh, embedNote],
  )

  const updateNote = useCallback(
    async (id: string, patch: Omit<NoteUpdate, 'embedding'>): Promise<Note> => {
      const updated = await dbUpdate(id, patch)
      await refresh()
      if (patch.title !== undefined || patch.body !== undefined) {
        void embedNote(id, updated.title, updated.body)
      }
      return updated
    },
    [refresh, embedNote],
  )

  const deleteNote = useCallback(
    async (id: string): Promise<void> => {
      await dbDelete(id)
      setEmbeddingIds((prev) => {
        const next = new Set(prev)
        next.delete(id)
        return next
      })
      await refresh()
    },
    [refresh],
  )

  const loadDemoNotes = useCallback(async (): Promise<void> => {
    // Dynamic import keeps demo data out of the initial bundle
    const { DEMO_NOTES } = await import('~/data/demoNotes')
    const created: Note[] = []
    for (const input of DEMO_NOTES) {
      const note = await dbCreate(input)
      created.push(note)
    }
    await refresh()
    // Embed immediately if model is already ready; otherwise the model-ready
    // effect above will catch up once the model finishes loading.
    if (modelStatusRef.current === 'ready') {
      for (const note of created) {
        void embedNote(note.id, note.title, note.body)
      }
    }
  }, [refresh, embedNote])

  return { notes, embeddingIds, modelStatus, modelProgress, modelError, createNote, updateNote, deleteNote, loadDemoNotes }
}
