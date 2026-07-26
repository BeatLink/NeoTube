import { isTauri, tauriFetch } from './tauri'

/**
 * Fetches an image and returns it as a base64 data URI suitable for direct
 * storage in PouchDB.
 *
 * Under Tauri the request goes through Rust's HTTP stack, which is not subject
 * to the webview's CORS rules. In a plain browser there is no way around those
 * rules for YouTube's image hosts, so this returns null and callers fall back
 * to the original URL.
 */
export async function downloadAvatar(url: string): Promise<string | null> {
  if (!url || !isTauri()) return null
  try {
    const response = await tauriFetch(url)
    if (!response.ok) return null
    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') ?? 'image/jpeg'

    let binary = ''
    const bytes = new Uint8Array(buffer)
    // Chunked to avoid blowing the argument limit on large images.
    const CHUNK = 0x8000
    for (let i = 0; i < bytes.length; i += CHUNK) {
      binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK))
    }
    return `data:${contentType};base64,${btoa(binary)}`
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
