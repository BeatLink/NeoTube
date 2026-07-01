declare global {
  interface Window {
    electron?: {
      platform: string
      downloadAvatar(url: string): Promise<string>
    }
  }
}

/**
 * Fetches an avatar URL through the Electron main process (bypasses CORS) and
 * returns a base64 data URI suitable for direct storage in PouchDB.
 * Returns null in non-Electron environments or if the download fails.
 */
export async function downloadAvatar(url: string): Promise<string | null> {
  if (!url || !window.electron?.downloadAvatar) return null
  try {
    return await window.electron.downloadAvatar(url)
  } catch {
    return null
  }
}
