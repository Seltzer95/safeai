/**
 * Inference Worker — Comlink-based embedding API
 *
 * ALL @huggingface/transformers usage is isolated here — never imported on the main thread.
 * Exposed via Comlink; main thread wraps with Comlink.wrap().
 *
 * Backend selection: tries WebGPU first; on any failure, falls back to WASM.
 */

import * as Comlink from 'comlink'
import type { FeatureExtractionPipeline } from '@huggingface/transformers'

export type ProgressCallback = (progress: number) => void

export type BackendName = 'webgpu' | 'wasm'

// State shared across calls
let pipeline: FeatureExtractionPipeline | null = null
let activeBackend: BackendName | null = null

/**
 * Load the embedding model. Tries WebGPU then falls back to WASM.
 * Calls onProgress(0–100) as model files download.
 */
async function loadModel(onProgress: ProgressCallback): Promise<BackendName> {
  console.log('[inference-worker] loadModel called')

  if (pipeline !== null) {
    console.log('[inference-worker] already loaded, returning cached backend:', activeBackend)
    return activeBackend!
  }

  // Dynamic import keeps @huggingface/transformers out of the main bundle
  console.log('[inference-worker] importing @huggingface/transformers...')
  const { pipeline: createPipeline, env } = await import('@huggingface/transformers')
  console.log('[inference-worker] transformers imported')

  // Disable local model cache for the worker context (use HF CDN)
  env.allowLocalModels = false

  const MODEL_ID = 'Xenova/all-MiniLM-L6-v2'

  // Track per-file download progress and merge into a single 0-100 value.
  // The progress_callback fires for each file individually.
  const fileProgress = new Map<string, number>()

  function progressCallback(p: {
    status: string
    name?: string
    file?: string
    progress?: number
    loaded?: number
    total?: number
  }) {
    console.log('[inference-worker] progress:', p.status, p.file ?? '', p.progress ?? '')
    if (p.status === 'progress' && p.file != null && p.progress != null) {
      fileProgress.set(p.file, p.progress)
      const values = Array.from(fileProgress.values())
      const avg = values.reduce((s, v) => s + v, 0) / values.length
      onProgress(Math.round(avg))
    }
    if (p.status === 'ready') {
      onProgress(100)
    }
  }

  // Try WebGPU first
  console.log('[inference-worker] trying WebGPU backend...')
  try {
    pipeline = await createPipeline('feature-extraction', MODEL_ID, {
      device: 'webgpu',
      dtype: 'fp32',
      progress_callback: progressCallback,
    })
    activeBackend = 'webgpu'
    console.info('[inference-worker] backend selected: WebGPU')
    return 'webgpu'
  } catch (gpuErr) {
    console.warn('[inference-worker] WebGPU unavailable, falling back to WASM:', gpuErr)
    pipeline = null
    fileProgress.clear()
  }

  // WASM fallback
  console.log('[inference-worker] trying WASM backend...')
  pipeline = await createPipeline('feature-extraction', MODEL_ID, {
    device: 'wasm',
    dtype: 'fp32',
    progress_callback: progressCallback,
  })
  activeBackend = 'wasm'
  console.info('[inference-worker] backend selected: WASM')
  return 'wasm'
}

/**
 * Embed a single string. Returns a Float32Array (384-dim for MiniLM-L6).
 * The model must be loaded first via loadModel().
 */
async function embed(text: string): Promise<number[]> {
  console.log('[inference-worker] embed called, text length:', text.length)
  if (pipeline === null) throw new Error('Model not loaded — call loadModel() first')

  const output = await pipeline(text, { pooling: 'mean', normalize: true })
  console.log('[inference-worker] embed done, dims:', output.data.length)
  // Return plain number[] to avoid Transferable complexity with Comlink
  return Array.from(output.data)
}

const api = { loadModel, embed }
export type InferenceWorkerApi = typeof api

// Guard: only expose via Comlink when actually running inside a Worker.
// Without this, SSR imports of this file crash because self.addEventListener
// doesn't exist in Node.js.
if (typeof WorkerGlobalScope !== 'undefined' && self instanceof WorkerGlobalScope) {
  Comlink.expose(api)
}
