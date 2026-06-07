import { describe, expect, it } from 'vitest'
import { cosineSimilarity, rankByQuery, rankBySimilarity } from './similarity'

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Build a unit-length vector along dimension `i` of size `n`. */
function basis(i: number, n: number): number[] {
  return Array.from({ length: n }, (_, j) => (j === i ? 1 : 0))
}

/** Scale a vector by a scalar. */
function scale(v: number[], s: number): number[] {
  return v.map((x) => x * s)
}

// ─── cosineSimilarity ─────────────────────────────────────────────────────────

describe('cosineSimilarity', () => {
  it('returns 1 for identical non-zero vectors', () => {
    const v = [0.5, 0.8, 0.3]
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5)
  })

  it('returns 1 for scaled copies (direction is the same)', () => {
    const v = [1, 2, 3]
    expect(cosineSimilarity(v, scale(v, 5))).toBeCloseTo(1, 5)
  })

  it('returns 0 for orthogonal vectors', () => {
    expect(cosineSimilarity(basis(0, 3), basis(1, 3))).toBeCloseTo(0, 5)
  })

  it('returns -1 for opposite vectors', () => {
    const v = [1, 0, 0]
    expect(cosineSimilarity(v, [-1, 0, 0])).toBeCloseTo(-1, 5)
  })

  it('handles zero vectors without NaN (returns ~0 due to epsilon)', () => {
    const result = cosineSimilarity([0, 0, 0], [1, 2, 3])
    expect(result).not.toBeNaN()
    expect(Math.abs(result)).toBeLessThan(1e-5)
  })

  it('handles vectors of length 1', () => {
    expect(cosineSimilarity([1], [1])).toBeCloseTo(1, 5)
    expect(cosineSimilarity([1], [-1])).toBeCloseTo(-1, 5)
  })

  it('treats missing (undefined) indices as 0', () => {
    // The loop is bounded by a.length, so b[i] can be undefined when b is shorter.
    // a=[1,1], b=[1]: loop runs twice; b[1] → undefined → 0
    // dot = 1*1 + 1*0 = 1; magA = sqrt(2); magB = 1
    const a = [1, 1]
    const b = [1]
    const expected = 1 / (Math.sqrt(2) * 1 + 1e-10)
    expect(cosineSimilarity(a, b)).toBeCloseTo(expected, 4)
  })
})

// ─── rankByQuery ─────────────────────────────────────────────────────────────

describe('rankByQuery', () => {
  it('returns empty array for empty notes', () => {
    expect(rankByQuery([1, 0, 0], [])).toEqual([])
  })

  it('returns results sorted best-first', () => {
    const query = basis(0, 3) // [1,0,0]
    const notes = [
      { id: 'a', embedding: basis(2, 3) }, // orthogonal → score ≈ 0
      { id: 'b', embedding: basis(0, 3) }, // identical  → score ≈ 1
      { id: 'c', embedding: [0.7, 0.7, 0] }, // partial overlap
    ]
    const ranked = rankByQuery(query, notes)
    expect(ranked[0]?.id).toBe('b')
    expect(ranked[1]?.id).toBe('c')
    expect(ranked[2]?.id).toBe('a')
  })

  it('scores are between -1 and 1', () => {
    const query = [0.5, 0.5, 0]
    const notes = [
      { id: 'x', embedding: [1, 0, 0] },
      { id: 'y', embedding: [0, 0, 1] },
      { id: 'z', embedding: [-1, 0, 0] },
    ]
    for (const r of rankByQuery(query, notes)) {
      expect(r.score).toBeGreaterThanOrEqual(-1 - 1e-9)
      expect(r.score).toBeLessThanOrEqual(1 + 1e-9)
    }
  })

  it('preserves all note IDs in output', () => {
    const notes = [
      { id: 'n1', embedding: [1, 0] },
      { id: 'n2', embedding: [0, 1] },
      { id: 'n3', embedding: [1, 1] },
    ]
    const ids = rankByQuery([1, 0], notes).map((r) => r.id)
    expect(ids.sort()).toEqual(['n1', 'n2', 'n3'])
  })
})

// ─── rankBySimilarity ─────────────────────────────────────────────────────────

describe('rankBySimilarity', () => {
  it('returns empty array for empty notes', () => {
    expect(rankBySimilarity([1, 0], [])).toEqual([])
  })

  it('ranks most-similar note first', () => {
    const source = [1, 0, 0]
    const notes = [
      { id: 'far', embedding: [0, 0, 1] },
      { id: 'near', embedding: [0.99, 0.14, 0] }, // very similar
      { id: 'mid', embedding: [0.7, 0.7, 0] },
    ]
    const ranked = rankBySimilarity(source, notes)
    expect(ranked[0]?.id).toBe('near')
    expect(ranked[ranked.length - 1]?.id).toBe('far')
  })

  it('is equivalent to rankByQuery for the same inputs', () => {
    const embedding = [0.3, 0.7, 0.1]
    const notes = [
      { id: 'a', embedding: [0.1, 0.9, 0] },
      { id: 'b', embedding: [0.8, 0.1, 0.5] },
    ]
    const byQuery = rankByQuery(embedding, notes)
    const bySimilarity = rankBySimilarity(embedding, notes)
    expect(bySimilarity.map((r) => r.id)).toEqual(byQuery.map((r) => r.id))
    for (let i = 0; i < byQuery.length; i++) {
      expect(bySimilarity[i]?.score).toBeCloseTo(byQuery[i]?.score ?? 0, 8)
    }
  })

  it('handles a single note', () => {
    const result = rankBySimilarity([1, 0], [{ id: 'only', embedding: [1, 0] }])
    expect(result).toHaveLength(1)
    expect(result[0]?.id).toBe('only')
    expect(result[0]?.score).toBeCloseTo(1, 5)
  })
})

// ─── related-notes ranking logic ─────────────────────────────────────────────

describe('related-notes ranking logic', () => {
  /**
   * Simulates the filtering and ranking logic used by useRelatedNotes:
   * - exclude the source note by id
   * - exclude notes without embeddings
   * - rank remaining notes and take top-N
   */
  function getRelated(
    sourceId: string,
    sourceEmbedding: number[],
    allNotes: { id: string; embedding: number[] | null }[],
    limit = 3,
  ) {
    const candidates = allNotes
      .filter((n) => n.id !== sourceId && n.embedding !== null)
      .map((n) => ({ id: n.id, embedding: n.embedding as number[] }))
    return rankBySimilarity(sourceEmbedding, candidates).slice(0, limit)
  }

  it('excludes the source note from results', () => {
    const source = { id: 'src', embedding: [1, 0] }
    const notes = [source, { id: 'other', embedding: [0.9, 0.1] }]
    const result = getRelated('src', source.embedding, notes)
    expect(result.every((r) => r.id !== 'src')).toBe(true)
  })

  it('excludes notes without embeddings', () => {
    const notes = [
      { id: 'a', embedding: [1, 0] },
      { id: 'noEmbed', embedding: null },
    ]
    const result = getRelated('x', [1, 0], notes)
    expect(result.every((r) => r.id !== 'noEmbed')).toBe(true)
  })

  it('respects the limit', () => {
    const notes = Array.from({ length: 10 }, (_, i) => ({
      id: `n${i}`,
      embedding: [Math.random(), Math.random()],
    }))
    const result = getRelated('src', [1, 0], notes, 3)
    expect(result.length).toBeLessThanOrEqual(3)
  })

  it('returns empty array when no candidates remain', () => {
    const notes = [{ id: 'src', embedding: [1, 0] }]
    expect(getRelated('src', [1, 0], notes)).toEqual([])
  })

  it('returns top matches in order', () => {
    const source = [1, 0, 0]
    const notes = [
      { id: 'best', embedding: [0.99, 0.14, 0] },
      { id: 'mid', embedding: [0.7, 0.7, 0] },
      { id: 'worst', embedding: [0, 0, 1] },
    ]
    const result = getRelated('src', source, notes, 2)
    expect(result).toHaveLength(2)
    expect(result[0]?.id).toBe('best')
    expect(result[1]?.id).toBe('mid')
  })
})
