/**
 * Singleton Comlink proxy for the inference worker.
 *
 * Browser-only — never called during SSR. All hooks and components that need
 * the inference worker import this module and call getInferenceApi() so that
 * exactly one Worker is created for the lifetime of the page.
 */

import * as Comlink from 'comlink'
import type { InferenceWorkerApi } from './inference.worker'

let _api: Comlink.Remote<InferenceWorkerApi> | null = null

export function getInferenceApi(): Comlink.Remote<InferenceWorkerApi> {
  if (_api) return _api

  const worker = new Worker(
    new URL('./inference.worker.ts', import.meta.url),
    { type: 'module' },
  )
  worker.onerror = (e) => {
    console.error('[inference-worker] runtime error:', e.message, e)
  }
  _api = Comlink.wrap<InferenceWorkerApi>(worker)
  return _api
}
