/**
 * useEmbedding — manages the inference worker lifecycle.
 *
 * Usage:
 *   const { status, progress, activeBackend, loadModel, embed, error } = useEmbedding()
 */

import { useRef, useState, useCallback } from 'react'
import * as Comlink from 'comlink'
import type { InferenceWorkerApi, BackendName } from '~/worker/inference.worker'

export type EmbeddingStatus = 'idle' | 'loading' | 'ready' | 'error'

export interface UseEmbeddingReturn {
  /** Current lifecycle status */
  status: EmbeddingStatus
  /** Download progress 0–100 (only meaningful while status === 'loading') */
  progress: number
  /** Which ONNX backend is active after the model loads */
  activeBackend: BackendName | null
  /** Last error message, if any */
  error: string | null
  /** Start loading the model (idempotent) */
  loadModel: () => Promise<void>
  /** Embed a string — resolves to Float32Array */
  embed: (text: string) => Promise<Float32Array>
}

export function useEmbedding(): UseEmbeddingReturn {
  const workerRef = useRef<Worker | null>(null)
  const apiRef = useRef<Comlink.Remote<InferenceWorkerApi> | null>(null)

  const [status, setStatus] = useState<EmbeddingStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [activeBackend, setActiveBackend] = useState<BackendName | null>(null)
  const [error, setError] = useState<string | null>(null)

  /**
   * Lazily create the worker and Comlink proxy (synchronous — no dynamic import).
   *
   * Vite recognises the `new Worker(new URL(..., import.meta.url))` pattern and
   * builds the worker as a separate chunk. This is the canonical Vite approach
   * for dynamic worker construction; `?worker` only works for static imports.
   */
  function getApi(): Comlink.Remote<InferenceWorkerApi> {
    if (apiRef.current) return apiRef.current

    console.log('[useEmbedding] creating Worker...')
    const worker = new Worker(
      new URL('../worker/inference.worker.ts', import.meta.url),
      { type: 'module' },
    )
    workerRef.current = worker

    worker.onerror = (e) => {
      console.error('[useEmbedding] Worker runtime error:', e.message, e)
    }

    apiRef.current = Comlink.wrap<InferenceWorkerApi>(worker)
    console.log('[useEmbedding] Worker created, Comlink proxy ready')
    return apiRef.current
  }

  const loadModel = useCallback(async () => {
    console.log('[useEmbedding] loadModel called — status:', status)
    if (status === 'loading' || status === 'ready') {
      console.log('[useEmbedding] already', status, '— skipping')
      return
    }

    setStatus('loading')
    setProgress(0)
    setError(null)

    try {
      const api = getApi()
      console.log('[useEmbedding] calling api.loadModel...')
      const backend = await api.loadModel(
        // Comlink.proxy wraps the callback so it crosses the worker boundary
        Comlink.proxy((p: number) => {
          console.log('[useEmbedding] progress update:', p)
          setProgress(p)
        }),
      )
      console.log('[useEmbedding] model ready, backend:', backend)
      setActiveBackend(backend)
      setStatus('ready')
    } catch (err) {
      console.error('[useEmbedding] loadModel failed:', err)
      const msg = err instanceof Error ? err.message : String(err)
      setError(msg)
      setStatus('error')
    }
  }, [status])

  const embed = useCallback(async (text: string): Promise<Float32Array> => {
    if (!apiRef.current) throw new Error('Worker not initialised')
    const nums = await apiRef.current.embed(text)
    return new Float32Array(nums)
  }, [])

  return { status, progress, activeBackend, error, loadModel, embed }
}
