/**
 * useAIActions — note-level AI actions backed by the inference worker.
 *
 * Uses the same shared inference worker as useEmbedding so no second Worker
 * is spawned.
 */

import { useCallback } from 'react'
import { getInferenceApi } from '~/worker/shared-api'
import type { Note } from '~/data/notes'

export interface SearchResult {
  noteId: string
  score: number
}

export interface UseAIActionsReturn {
  /**
   * Embed the query in the worker, then rank all notes that have embeddings
   * by cosine similarity. Returns results sorted best-first with 0–1 scores.
   * Requires the embedding model to be loaded (modelStatus === 'ready').
   */
  rankNotes: (query: string, notes: Note[]) => Promise<SearchResult[]>
}

export function useAIActions(): UseAIActionsReturn {
  const rankNotes = useCallback(
    async (query: string, notes: Note[]): Promise<SearchResult[]> => {
      const notesWithEmbeddings = notes
        .filter((n) => n.embedding !== null)
        .map((n) => ({ id: n.id, embedding: Array.from(n.embedding as Float32Array) }))

      if (notesWithEmbeddings.length === 0) return []

      const api = getInferenceApi()
      const queryEmbedding = await api.embed(query)
      const ranked = await api.rankByQuery(queryEmbedding, notesWithEmbeddings)
      return ranked.map((r) => ({ noteId: r.id, score: r.score }))
    },
    [],
  )

  return { rankNotes }
}
