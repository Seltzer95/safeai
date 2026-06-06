import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    // DOM tests (components, hooks, data layer)
    environment: 'jsdom',
    include: ['app/**/*.test.{ts,tsx}'],
    // Worker tests run with `@vitest-environment node` pragma or a separate workspace entry
    exclude: ['node_modules', 'dist', '.output'],
  },
  resolve: {
    alias: {
      '~': resolve(__dirname, './app'),
    },
  },
})
