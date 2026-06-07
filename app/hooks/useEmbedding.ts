/**
 * useEmbedding — manages the embedding model lifecycle.
 *
 * Uses the shared inference worker singleton (see shared-api.ts) so that
 * other hooks (useAIActions) can share the same worker without spawning a
 * second instance.
 *
 * Usage:
 *   const { status, progress, activeBackend, loadModel, embed, error } = useEmbedding()
 */

import { useRef, useState, useCallback } from 'react'
import * as Comlink from 'comlink'
import type { InferenceWorkerApi, BackendName } from '~/worker/inference.worker'
import { getInferenceApi } from '~/worker/shared-api'

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
  const apiRef = useRef<Comlink.Remote<InferenceWorkerApi> | null>(null)

  const [status, setStatus] = useState<EmbeddingStatus>('idle')
  const [progress, setProgress] = useState(0)
  const [activeBackend, setActiveBackend] = useState<BackendName | null>(null)
  const [error, setError] = useState<string | null>(null)

  /** Returns the shared Comlink proxy, creating it once on first call. */
  function getApi(): Comlink.Remote<InferenceWorkerApi> {
    if (apiRef.current) return apiRef.current
    apiRef.current = getInferenceApi()
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

    // Backend override: set via browser console to force a specific backend, e.g.:
    //   localStorage.setItem('SAFEAI_BACKEND', 'wasm')  // force WASM (faster on Intel Mac)
    //   localStorage.removeItem('SAFEAI_BACKEND')        // revert to auto
    const backendOverride =
      (typeof localStorage !== 'undefined'
        ? (localStorage.getItem('SAFEAI_BACKEND') as BackendName | null)
        : null) ?? undefined
    if (backendOverride) {
      console.log('[useEmbedding] backend override from localStorage:', backendOverride)
    }

    try {
      const api = getApi()
      console.log('[useEmbedding] calling api.loadModel...')
      const backend = await api.loadModel(
        // Comlink.proxy wraps the callback so it crosses the worker boundary
        Comlink.proxy((p: number) => {
          setProgress(p)
        }),
        backendOverride,
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
