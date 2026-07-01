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

// Downloads thumbnail URLs for an array of video objects and replaces them
// with base64 data URIs. Already-cached blobs (data: URIs) are left unchanged.
// Falls back to the original URL if the download fails.
export async function downloadVideosWithThumbnailBlobs<T extends { thumbnail: string }>(
  videos: T[],
): Promise<T[]> {
  return Promise.all(
    videos.map(async v => {
      if (!v.thumbnail || v.thumbnail.startsWith('data:')) return v
      const blob = await downloadAvatar(v.thumbnail)
      return blob ? { ...v, thumbnail: blob } : v
    }),
  )
}
