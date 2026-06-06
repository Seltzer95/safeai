import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const t0 = Date.now()
  console.log('[router] getRouter() called')
  const router = createTanStackRouter({ routeTree })
  console.log(`[router] createTanStackRouter done in ${Date.now() - t0}ms`)
  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}
