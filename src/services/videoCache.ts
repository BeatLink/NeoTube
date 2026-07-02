import { getCachedChannelVideos, setCachedChannelVideos, updateHistoryThumbnail } from '../db/index'
import { pluginManager } from '../plugins/manager'
import { downloadAvatar, downloadVideosWithThumbnailBlobs } from '../utils/avatar'
import type { CachedVideo, WatchHistoryEntry } from '../types'

const YT_THUMB = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

async function fetchAndPersist(
  channelId: string,
  limit?: number,
  onFresh?: (videos: CachedVideo[]) => void,
): Promise<CachedVideo[]> {
  const plugin = pluginManager.getActive()
  const fresh = await (plugin.getChannelVideos?.(channelId, limit) ?? Promise.resolve([]))
  const withBlobs = await downloadVideosWithThumbnailBlobs(fresh)
  const videos: CachedVideo[] = withBlobs.map(v => ({
    videoId: v.videoId,
    title: v.title,
    channelId: v.channelId ?? channelId,
    channelName: v.channelName ?? '',
    thumbnail: v.thumbnail,
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

/**
 * Downloads thumbnail blobs for history entries that don't already have one.
 * Processes in batches; for each successful download, persists to DB and
 * calls onEach so the caller can update UI incrementally.
 */
export async function cacheHistoryThumbnails(
  entries: WatchHistoryEntry[],
  onEach?: (videoId: string, dataUri: string) => void,
  batchSize = 10,
): Promise<void> {
  const toFetch = entries.filter(e => !e.thumbnail?.startsWith('data:'))
  for (let i = 0; i < toFetch.length; i += batchSize) {
    await Promise.allSettled(toFetch.slice(i, i + batchSize).map(async entry => {
      const url = entry.thumbnail || YT_THUMB(entry.videoId)
      const blob = await downloadAvatar(url)
      if (blob) {
        await updateHistoryThumbnail(entry.videoId, blob)
        onEach?.(entry.videoId, blob)
      }
    }))
  }
}
