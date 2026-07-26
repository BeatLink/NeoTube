import { getCachedChannelVideos, setCachedChannelVideos } from '../db/index'
import { pluginManager } from '../plugins/manager'
import { thumbnailUrl } from '../utils/avatar'
import type { CachedVideo } from '../types'

function toCachedVideos(
  raw: Array<{ videoId: string; title: string; channelId?: string; channelName?: string
    thumbnail: string; duration: number; viewCount?: number; publishedAt?: string
    viewCountText?: string; publishedText?: string }>,
  channelId: string,
): CachedVideo[] {
  // Thumbnails are stored as URLs, not downloaded blobs — see thumbnailUrl().
  return raw.map(v => ({
    videoId: v.videoId,
    title: v.title,
    channelId: v.channelId ?? channelId,
    channelName: v.channelName ?? '',
    thumbnail: thumbnailUrl(v.thumbnail, v.videoId),
    duration: v.duration,
    viewCount: v.viewCount,
    publishedAt: v.publishedAt,
    viewCountText: v.viewCountText,
    publishedText: v.publishedText,
  }))
}

export type ChannelSort = 'Latest' | 'Popular' | 'Oldest'

/**
 * Each ordering is cached separately: YouTube returns a different page of
 * videos per sort, so they must not overwrite one another.
 */
function cacheKey(channelId: string, sort: ChannelSort): string {
  return sort === 'Latest' ? channelId : `${channelId}::${sort}`
}

async function fetchAndPersist(
  channelId: string,
  limit?: number,
  onFresh?: (videos: CachedVideo[]) => void,
  sort: ChannelSort = 'Latest',
): Promise<CachedVideo[]> {
  const plugin = pluginManager.getActive()
  const fresh = await (
    plugin.getChannelVideos?.(
      channelId,
      limit,
      // Fetching a whole channel takes several round trips, so surface each
      // page as it lands rather than leaving the grid empty until the end.
      onFresh ? page => onFresh(toCachedVideos(page, channelId)) : undefined,
      sort,
    ) ?? Promise.resolve([])
  )
  const videos = toCachedVideos(fresh, channelId)
  await setCachedChannelVideos(cacheKey(channelId, sort), videos)
  onFresh?.(videos)
  return videos
}

/**
 * Returns cached channel videos from DB immediately (or null).
 * Fires a background fetch; once fresh data is persisted to DB, calls onFresh.
 * The caller's onFresh should guard against stale state (e.g. component unmounted).
 */
export async function getOrFetchChannelVideos(
  channelId: string,
  onFresh?: (videos: CachedVideo[]) => void,
  limit?: number,
  sort: ChannelSort = 'Latest',
): Promise<CachedVideo[] | null> {
  const cached = await getCachedChannelVideos(cacheKey(channelId, sort)).catch(() => null)
  fetchAndPersist(channelId, limit, onFresh, sort).catch(() => {})
  return cached
}

/**
 * Fetches fresh channel videos, persists them to the DB, and returns them.
 * Awaitable — use in batched loops where concurrency must be controlled.
 * Calls onFresh when data is ready (same as the resolved value).
 */
export async function refreshChannelVideos(
  channelId: string,
  onFresh?: (videos: CachedVideo[]) => void,
  limit?: number,
): Promise<CachedVideo[]> {
  return fetchAndPersist(channelId, limit, onFresh)
}

// History thumbnails are no longer downloaded and inlined as base64. Doing so
// meant thousands of requests and a multi-megabyte database that slowed every
// read; `<img loading="lazy">` fetches only what is on screen and lets the
// webview cache it.
