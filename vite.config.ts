import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    // Tauri's devUrl points at this exact port. strictPort makes a clash fail
    // loudly rather than silently moving Vite and leaving Tauri on a blank page.
    port: 5173,
    strictPort: true,
  },
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
    setupFiles: ['./tests/setup.ts'],
  },
})
