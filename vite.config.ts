import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Polyfill Node's `events` module so PouchDB works in the browser
      events: 'events',
    },
  },
  optimizeDeps: {
    include: ['pouchdb-browser'],
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
  },
})
