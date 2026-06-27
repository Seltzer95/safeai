import path from 'node:path'
import { cloudflare } from '@cloudflare/vite-plugin'
import tailwindcss from '@tailwindcss/vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

export default defineConfig({
  resolve: {
    alias: {
      '~': path.resolve(import.meta.dirname, './app'),
    },
  },
  optimizeDeps: {
    exclude: ['@huggingface/transformers'],
  },
  plugins: [
    // Cloudflare Workers adapter — must come before tanstackStart.
    // Targets the SSR Vite environment so TanStack Start's server entry
    // is compiled as a Cloudflare Worker module.
    cloudflare({ viteEnvironment: { name: 'ssr' } }),
    // Serve model files with long-lived HTTP cache headers in dev.
    // Production cache headers live in public/_headers (Cloudflare Pages)
    // and are set by the Worker for SSR responses.
    {
      name: 'model-cache-headers',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          if (req.url?.startsWith('/models/')) {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
          }
          next()
        })
      },
    },
    tanstackStart({
      srcDirectory: './app',
      router: {
        routesDirectory: './routes',
        generatedRouteTree: './routeTree.gen.ts',
        routeFileIgnorePattern: '.test.',
      },
    }),
    // react's vite plugin must come after start's vite plugin
    viteReact(),
    tailwindcss(),
  ],
})
