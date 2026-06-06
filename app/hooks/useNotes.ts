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
  createNote: (input: NoteInput) => Promise<Note>
  updateNote: (id: string, patch: Omit<NoteUpdate, 'embedding'>) => Promise<Note>
  deleteNote: (id: string) => Promise<void>
}

export function useNotes(): UseNotesReturn {
  const [notes, setNotes] = useState<Note[]>([])
  const [embeddingIds, setEmbeddingIds] = useState<Set<string>>(new Set())
  const { loadModel, embed, status: modelStatus } = useEmbedding()
  const didInit = useRef(false)

  const refresh = useCallback(async () => {
    setNotes(await listNotes())
  }, [])

  // Load model and hydrate notes once on mount
  useEffect(() => {
    if (didInit.current) return
    didInit.current = true
    void loadModel()
    void refresh()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  /** Fire-and-forget: compute embedding for a note and persist it. */
  const embedNote = useCallback(
    async (id: string, title: string, body: string) => {
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

  return { notes, embeddingIds, modelStatus, createNote, updateNote, deleteNote }
}
