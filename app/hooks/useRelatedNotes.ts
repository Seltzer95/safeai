/**
 * useRelatedNotes — find notes semantically similar to the selected note.
 *
 * Runs entirely off the main thread via the shared inference worker.
 * Only considers notes that already have stored embeddings.
 * No model inference is performed — only vector math.
 */

import { useState, useEffect } from 'react'
import { getInferenceApi } from '~/worker/shared-api'
import type { Note } from '~/data/notes'

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

    void api.rankBySimilarity(sourceEmbedding, candidates).then((ranked) => {
      if (cancelled) return
      const result = ranked
        .slice(0, limit)
        .map((r) => {
          const note = allNotes.find((n) => n.id === r.id)
          return note ? { note, score: r.score } : null
        })
        .filter((x): x is RelatedNote => x !== null)
      setRelated(result)
    }).catch(() => {
      if (!cancelled) setRelated([])
    })

    return () => {
      cancelled = true
    }
  // Re-run when the selected note changes or when any note gains an embedding
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedNote?.id, selectedNote?.embedding, allNotes, limit])

  return related
}
