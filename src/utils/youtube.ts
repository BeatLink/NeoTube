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

/**
 * Extracts a YouTube channel identifier from a channel URL.
 * Returns the channel ID or handle (with @) to use as the route param,
 * or null if the input is not a recognisable channel URL.
 *
 * Handles:
 *   https://www.youtube.com/channel/UCxxxxxx   → "UCxxxxxx"
 *   https://www.youtube.com/@handle            → "@handle"
 *   https://www.youtube.com/c/customname       → "@customname"
 *   https://www.youtube.com/user/username      → "@username"
 */
export function parseChannelUrl(input: string): string | null {
  const trimmed = input.trim()
  if (!trimmed) return null

  try {
    const url = new URL(trimmed)
    const host = url.hostname.replace(/^www\.|^m\./, '')
    if (host !== 'youtube.com') return null

    const p = url.pathname

    // /channel/UCxxxxxx
    const channelMatch = p.match(/^\/channel\/(UC[A-Za-z0-9_-]+)/)
    if (channelMatch) return channelMatch[1]

    // /@handle
    const handleMatch = p.match(/^\/@([A-Za-z0-9._-]+)/)
    if (handleMatch) return `@${handleMatch[1]}`

    // /c/name or /user/name — prefix with @ so the Channel page treats it as a handle
    const legacyMatch = p.match(/^\/(c|user)\/([A-Za-z0-9._-]+)/)
    if (legacyMatch) return `@${legacyMatch[2]}`
  } catch {
    // not a URL
  }

  return null
}
