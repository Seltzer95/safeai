/**
 * useRelatedNotes — find notes semantically similar to the selected note.
 *
 * Runs entirely off the main thread via the shared inference worker.
 * Only considers notes that already have stored embeddings.
 * No model inference is performed — only vector math.
 */

import { useEffect, useState } from 'react'
import type { Note } from '~/data/notes'
import { getInferenceApi } from '~/worker/shared-api'

export interface RelatedNote {
  note: Note
  score: number
}

export function useRelatedNotes(
  selectedNote: Note | null,
  allNotes: Note[],
  limit = 5,
): RelatedNote[] {
  const [related, setRelated] = useState<RelatedNote[]>([])

  useEffect(() => {
    if (!selectedNote || selectedNote.embedding === null) {
      setRelated([])
      return
    }

    const sourceEmbedding = Array.from(selectedNote.embedding)
    const candidates = allNotes
      .filter((n) => n.id !== selectedNote.id && n.embedding !== null)
      .map((n) => ({ id: n.id, embedding: Array.from(n.embedding as Float32Array) }))

    if (candidates.length === 0) {
      setRelated([])
      return
    }

    let cancelled = false
    const api = getInferenceApi()

    void api
      .rankBySimilarity(sourceEmbedding, candidates)
      .then((ranked) => {
        if (cancelled) return
        const result = ranked
          .slice(0, limit)
          .map((r) => {
            const note = allNotes.find((n) => n.id === r.id)
            return note ? { note, score: r.score } : null
          })
          .filter((x): x is RelatedNote => x !== null)
        setRelated(result)
      })
      .catch(() => {
        if (!cancelled) setRelated([])
      })

    return () => {
      cancelled = true
    }
    // Re-run whenever selectedNote changes (id, embedding, or any other field),
    // or when the notes list is updated (embeddings computed by the worker).
  }, [selectedNote, allNotes, limit])

  return related
}
