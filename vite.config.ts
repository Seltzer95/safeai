import path from 'node:path'
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
    // Serve model files with long-lived HTTP cache headers so the browser
    // won't re-download them on refresh (works independently of the Cache API).
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
