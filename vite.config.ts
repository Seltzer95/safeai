import { defineConfig } from 'vite'
import { tanstackStart } from '@tanstack/react-start/plugin/vite'
import viteReact from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'node:path'

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
