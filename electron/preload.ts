import { contextBridge } from 'electron'

// Expose safe APIs to the renderer process here via contextBridge.exposeInMainWorld().
// Keep this minimal — the renderer uses PouchDB directly for all data access.
contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
})
