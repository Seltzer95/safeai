import {
  createStartHandler,
  defaultStreamHandler,
} from '@tanstack/react-start/server'
import { getRouter } from './router'

const _handle = createStartHandler({
  createRouter: getRouter,
})(defaultStreamHandler)

/**
 * Timing wrapper around the SSR handler.
 *
 * KEY DIAGNOSTIC:
 *   If "[ssr] ←" logs in < 1 second → SSR itself is fast.
 *   The 4-minute hang is in client-side CSS/JS asset loading
 *   (most likely Vite blocking while transforming @huggingface/transformers).
 *
 *   If "[ssr] ←" takes minutes → the bottleneck is inside the SSR handler
 *   or Vite's SSR module loading/transform for the server bundle.
 */
export default async function ssrHandler(request: Request): Promise<Response> {
  const t0 = Date.now()
  const path = (() => {
    try {
      return new URL(request.url).pathname
    } catch {
      return request.url
    }
  })()
  console.log(`[ssr] → ${request.method} ${path} @ ${new Date().toISOString()}`)

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const response = await (_handle as any)(request)

  console.log(`[ssr] ← ${(response as Response).status} in ${Date.now() - t0}ms`)
  return response as Response
}
