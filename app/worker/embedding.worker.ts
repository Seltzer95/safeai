/**
 * Plain postMessage embedding worker — no Comlink.
 * Messages in:  { type: 'LOAD' } | { type: 'EMBED', text: string }
 * Messages out: { type: 'PROGRESS', value: number }
 *             | { type: 'LOADED', backend: string }
 *             | { type: 'EMBEDDED', data: number[] }
 *             | { type: 'ERROR', message: string }
 */

import type { FeatureExtractionPipeline } from '@huggingface/transformers'

let pipeline: FeatureExtractionPipeline | null = null

self.onmessage = async (e: MessageEvent) => {
  const msg = e.data as { type: string; text?: string }
  console.log('[embedding-worker] received:', msg.type)

  if (msg.type === 'LOAD') {
    if (pipeline !== null) {
      self.postMessage({ type: 'LOADED', backend: 'cached' })
      return
    }

    try {
      const { pipeline: createPipeline, env } = await import('@huggingface/transformers')
      env.allowLocalModels = true
      env.allowRemoteModels = false
      env.localModelPath = '/models/'

      const MODEL_ID = 'all-MiniLM-L6-v2'
      const fileProgress = new Map<string, number>()

      function onProgress(p: { status: string; file?: string; progress?: number }) {
        console.log('[embedding-worker] progress:', p.status, p.file ?? '', p.progress ?? '')
        if (p.status === 'progress' && p.file != null && p.progress != null) {
          fileProgress.set(p.file, p.progress)
          const vals = Array.from(fileProgress.values())
          const avg = vals.reduce((s, v) => s + v, 0) / vals.length
          self.postMessage({ type: 'PROGRESS', value: Math.round(avg) })
        }
        if (p.status === 'ready') {
          self.postMessage({ type: 'PROGRESS', value: 100 })
        }
      }

      let backend = 'wasm'
      try {
        console.log('[embedding-worker] trying WebGPU...')
        pipeline = await createPipeline('feature-extraction', MODEL_ID, {
          device: 'webgpu',
          dtype: 'q8',
          progress_callback: onProgress,
        })
        backend = 'webgpu'
      } catch {
        console.warn('[embedding-worker] WebGPU failed, trying WASM...')
        pipeline = null
        fileProgress.clear()
        pipeline = await createPipeline('feature-extraction', MODEL_ID, {
          device: 'wasm',
          dtype: 'q8',
          progress_callback: onProgress,
        })
      }

      console.log('[embedding-worker] loaded, backend:', backend)
      self.postMessage({ type: 'LOADED', backend })
    } catch (err) {
      console.error('[embedding-worker] load failed:', err)
      self.postMessage({ type: 'ERROR', message: String(err) })
    }

  } else if (msg.type === 'EMBED') {
    if (!pipeline) {
      self.postMessage({ type: 'ERROR', message: 'Model not loaded' })
      return
    }
    try {
      const output = await pipeline(msg.text ?? '', { pooling: 'mean', normalize: true })
      self.postMessage({ type: 'EMBEDDED', data: Array.from(output.data) })
    } catch (err) {
      self.postMessage({ type: 'ERROR', message: String(err) })
    }
  }
}
