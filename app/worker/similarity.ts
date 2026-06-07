/**
 * Cosine-similarity utilities — pure functions with no worker dependency.
 * Extracted here so they can be imported and unit-tested directly.
 */

export type RankedItem = { id: string; score: number }
export type EmbeddedNote = { id: string; embedding: number[] }

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0
  let magA = 0
  let magB = 0
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0
    const bi = b[i] ?? 0
    dot += ai * bi
    magA += ai * ai
    magB += bi * bi
  }
  return dot / (Math.sqrt(magA) * Math.sqrt(magB) + 1e-10)
}

/** Rank notes by cosine similarity to a query embedding. Returns best-first. */
export function rankByQuery(queryEmbedding: number[], notes: EmbeddedNote[]): RankedItem[] {
  return notes
    .map((n) => ({ id: n.id, score: cosineSimilarity(queryEmbedding, n.embedding) }))
    .sort((a, b) => b.score - a.score)
}

/**
 * Rank notes by similarity to a source embedding.
 * Caller is responsible for excluding the source note from `notes`.
 * Returns best-first with 0–1 scores.
 */
export function rankBySimilarity(sourceEmbedding: number[], notes: EmbeddedNote[]): RankedItem[] {
  return notes
    .map((n) => ({ id: n.id, score: cosineSimilarity(sourceEmbedding, n.embedding) }))
    .sort((a, b) => b.score - a.score)
}
