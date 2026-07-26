import { getCachedChannelVideos, setCachedChannelVideos } from '../db/index'
import { pluginManager } from '../plugins/manager'
import { thumbnailUrl } from '../utils/avatar'
import type { CachedVideo } from '../types'

async function fetchAndPersist(
  channelId: string,
  limit?: number,
  onFresh?: (videos: CachedVideo[]) => void,
): Promise<CachedVideo[]> {
  const plugin = pluginManager.getActive()
  const fresh = await (plugin.getChannelVideos?.(channelId, limit) ?? Promise.resolve([]))
  // Thumbnails are stored as URLs, not downloaded blobs — see thumbnailUrl().
  const videos: CachedVideo[] = fresh.map(v => ({
    videoId: v.videoId,
    title: v.title,
    channelId: v.channelId ?? channelId,
    channelName: v.channelName ?? '',
    thumbnail: thumbnailUrl(v.thumbnail, v.videoId),
    duration: v.duration,
    viewCount: v.viewCount,
    publishedAt: v.publishedAt,
  }))
  await setCachedChannelVideos(channelId, videos)
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
): Promise<CachedVideo[] | null> {
  const cached = await getCachedChannelVideos(channelId).catch(() => null)
  fetchAndPersist(channelId, limit, onFresh).catch(() => {})
  return cached
}

/**
 * Fetches fresh channel videos, persists to DB with blob thumbnails, and returns them.
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
