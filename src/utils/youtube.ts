/**
 * Extracts a YouTube video ID from any common URL format.
 * Returns null if the input is not a recognisable YouTube URL.
 *
 * Handles:
 *   https://www.youtube.com/watch?v=ID
 *   https://youtu.be/ID
 *   https://www.youtube.com/shorts/ID
 *   https://www.youtube.com/embed/ID
 *   https://m.youtube.com/watch?v=ID
 */
export function parseVideoId(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    const host = url.hostname.replace(/^www\.|^m\./, '')

    if (host === 'youtube.com') {
      // /watch?v=ID
      const v = url.searchParams.get('v')
      if (v) return v

      // /shorts/ID  or  /embed/ID
      const match = url.pathname.match(/^\/(shorts|embed)\/([A-Za-z0-9_-]{11})/)
      if (match) return match[2]
    }

    if (host === 'youtu.be') {
      const id = url.pathname.slice(1).split('?')[0]
      if (id.length === 11) return id
    }
  } catch {
    // not a URL — ignore
  }

  // Bare 11-character video ID
  if (/^[A-Za-z0-9_-]{11}$/.test(trimmed)) return trimmed

  return null
}
