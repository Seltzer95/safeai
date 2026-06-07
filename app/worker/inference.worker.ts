/**
 * Inference Worker — Comlink-based embedding API
 *
 * ALL @huggingface/transformers usage is isolated here — never imported on the main thread.
 * Exposed via Comlink; main thread wraps with Comlink.wrap().
 *
 * Backend selection: if forceBackend is provided, use that backend only.
 * Otherwise tries WebGPU first; on any failure, falls back to WASM.
 *
 * Timing: logs separate download and backend-init durations so you can tell
 * whether the slow part is file fetching or GPU graph compilation.
 *
 * Force WASM from browser console:
 *   localStorage.setItem('SAFEAI_BACKEND', 'wasm')  // then refresh
 *   localStorage.removeItem('SAFEAI_BACKEND')        // revert to auto
 */

import * as Comlink from 'comlink'
import type { FeatureExtractionPipeline } from '@huggingface/transformers'

export type ProgressCallback = (progress: number) => void

export type BackendName = 'webgpu' | 'wasm'

// State shared across calls
let pipeline: FeatureExtractionPipeline | null = null
let activeBackend: BackendName | null = null

/**
 * Load the embedding model.
 *
 * @param onProgress  - called with 0–100 as files are fetched
 * @param forceBackend - 'wasm' skips WebGPU entirely; 'webgpu' skips the WASM fallback;
 *                       omit for auto (WebGPU → WASM)
 */
async function loadModel(onProgress: ProgressCallback, forceBackend?: BackendName): Promise<BackendName> {
  console.log('[inference-worker] loadModel called, forceBackend:', forceBackend ?? 'auto')

  if (pipeline !== null) {
    console.log('[inference-worker] already loaded, returning cached backend:', activeBackend)
    return activeBackend!
  }

  // Dynamic import keeps @huggingface/transformers out of the main bundle
  const { pipeline: createPipeline, env } = await import('@huggingface/transformers')

  env.allowLocalModels = true
  env.allowRemoteModels = false
  env.useBrowserCache = true
  env.localModelPath = '/models/'

  console.log('[inference-worker] Cache API available:', typeof caches !== 'undefined')

  const MODEL_ID = 'all-MiniLM-L6-v2'
  const fileProgress = new Map<string, number>()

  // Timing state (reset on each attempt)
  let t0 = performance.now()
  let tFilesReady: number | null = null
  let cachedCount = 0
  let downloadedCount = 0

  function progressCallback(p: {
    status: string
    name?: string
    file?: string
    progress?: number
    loaded?: number
    total?: number
  }) {
    if (p.status === 'progress' && p.file != null && p.progress != null) {
      fileProgress.set(p.file, p.progress)
      const values = Array.from(fileProgress.values())
      const avg = values.reduce((s, v) => s + v, 0) / values.length
      onProgress(Math.round(avg))
    }

    if (p.status === 'done') {
      tFilesReady = performance.now()
      downloadedCount++
      console.log(`[inference-worker] [download] done: ${p.file} (${downloadedCount} files)`)
    }

    // transformers.js fires 'cached' instead of 'progress'/'done' when the file
    // is served from the Cache API — no network request was made.
    if (p.status === 'cached') {
      tFilesReady = performance.now()
      cachedCount++
      // Count cached file as fully loaded so progress bar advances
      if (p.file != null) {
        fileProgress.set(p.file, 100)
        const values = Array.from(fileProgress.values())
        const avg = values.reduce((s, v) => s + v, 0) / values.length
        onProgress(Math.round(avg))
      }
      console.log(`[inference-worker] [cache] HIT: ${p.file} (${cachedCount} cached so far)`)
    }

    if (p.status === 'ready') {
      onProgress(100)
    }
  }

  function logTiming(label: string) {
    const t1 = performance.now()
    const fetchMs = tFilesReady != null ? tFilesReady - t0 : t1 - t0
    const initMs = tFilesReady != null ? t1 - tFilesReady : 0
    console.info(
      `[inference-worker] [timing/${label}]` +
        ` files: ${fetchMs.toFixed(0)}ms (${cachedCount} cached, ${downloadedCount} downloaded),` +
        ` backend-init: ${initMs.toFixed(0)}ms,` +
        ` total: ${(t1 - t0).toFixed(0)}ms`,
    )
  }

  function resetAttempt() {
    pipeline = null
    fileProgress.clear()
    t0 = performance.now()
    tFilesReady = null
    cachedCount = 0
    downloadedCount = 0
  }

  // Try WebGPU (unless caller forced WASM)
  if (forceBackend !== 'wasm') {
    console.log('[inference-worker] trying WebGPU backend...')
    try {
      pipeline = await createPipeline('feature-extraction', MODEL_ID, {
        device: 'webgpu',
        dtype: 'q8',
        progress_callback: progressCallback,
      })
      activeBackend = 'webgpu'
      logTiming('webgpu')
      console.info('[inference-worker] backend selected: WebGPU')
      return 'webgpu'
    } catch (gpuErr) {
      const elapsed = (performance.now() - t0).toFixed(0)
      console.warn(
        `[inference-worker] WebGPU failed after ${elapsed}ms` +
          ` (${cachedCount} cached, ${downloadedCount} downloaded):`,
        gpuErr,
      )
      if (forceBackend === 'webgpu') throw gpuErr
      resetAttempt()
    }
  }

  // WASM fallback
  console.log('[inference-worker] trying WASM backend...')
  pipeline = await createPipeline('feature-extraction', MODEL_ID, {
    device: 'wasm',
    dtype: 'q8',
    progress_callback: progressCallback,
  })
  activeBackend = 'wasm'
  logTiming('wasm')
  console.info('[inference-worker] backend selected: WASM')
  return 'wasm'
}

/**
 * Embed a single string. Returns a Float32Array (384-dim for MiniLM-L6).
 * The model must be loaded first via loadModel().
 */
async function embed(text: string): Promise<number[]> {
  if (pipeline === null) throw new Error('Model not loaded — call loadModel() first')

  const output = await pipeline(text, { pooling: 'mean', normalize: true })
  // Return plain number[] to avoid Transferable complexity with Comlink
  return Array.from(output.data)
}

// ─── Cosine-similarity ranking (runs entirely in the worker) ─────────────────

function cosineSimilarity(a: number[], b: number[]): number {
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

async function rankByQuery(
  queryEmbedding: number[],
  notes: { id: string; embedding: number[] }[],
): Promise<{ id: string; score: number }[]> {
  return notes
    .map((n) => ({ id: n.id, score: cosineSimilarity(queryEmbedding, n.embedding) }))
    .sort((a, b) => b.score - a.score)
}

/**
 * Rank a list of notes by similarity to a source embedding.
 * The caller is responsible for excluding the source note from `notes`.
 * Returns results sorted best-first with 0–1 scores.
 */
async function rankBySimilarity(
  sourceEmbedding: number[],
  notes: { id: string; embedding: number[] }[],
): Promise<{ id: string; score: number }[]> {
  return notes
    .map((n) => ({ id: n.id, score: cosineSimilarity(sourceEmbedding, n.embedding) }))
    .sort((a, b) => b.score - a.score)
}

// ─── Public API ──────────────────────────────────────────────────────────────

const api = { loadModel, embed, rankByQuery, rankBySimilarity }
export type InferenceWorkerApi = typeof api

// Guard: only expose via Comlink when actually running inside a Worker.
// Without this, SSR imports of this file crash because self.addEventListener
// doesn't exist in Node.js.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  Comlink.expose(api)
}
