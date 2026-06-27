import { createStartHandler, defaultStreamHandler } from '@tanstack/react-start/server'

const handler = createStartHandler(defaultStreamHandler)

// Cross-origin isolation headers required for SharedArrayBuffer / WebGPU threading.
// Applied to every SSR response so that HTML documents and any server-rendered
// assets all carry the correct policy. Static files served directly by the
// Cloudflare edge pick these up from public/_headers instead.
const ISOLATION_HEADERS: Record<string, string> = {
  'Cross-Origin-Opener-Policy': 'same-origin',
  'Cross-Origin-Embedder-Policy': 'require-corp',
}

export default {
  async fetch(request: Request): Promise<Response> {
    const response = await handler(request)
    const headers = new Headers(response.headers)
    for (const [key, value] of Object.entries(ISOLATION_HEADERS)) {
      headers.set(key, value)
    }
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    })
  },
}
