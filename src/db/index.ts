// pouchdb-browser uses IndexedDB — the correct adapter for all browser/Electron targets.
// Tests import pouchdb directly with the memory adapter (see src/test/db.test.ts).
import PouchDB from 'pouchdb-browser'
import type { UserSettings, Subscription, WatchHistoryEntry, CachedVideo, ChannelVideoCache } from '../types'

// Lazy singleton — deferred until first use so tests that mock this module
// never trigger the IndexedDB constructor in jsdom.
let _db: PouchDB.Database | null = null
function db(): PouchDB.Database {
  if (!_db) _db = new PouchDB('neotube')
  return _db
}

// ─── Migrations ───────────────────────────────────────────────────────────────

const YT_THUMB = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`

/**
 * Replaces inlined base64 thumbnails with plain URLs.
 *
 * Older versions downloaded every thumbnail and stored it as a data URI, which
 * left multi-megabyte documents that made each read slow. Thumbnails now load
 * lazily from YouTube, so the stored copies are dead weight.
 *
 * Safe to call repeatedly: it only rewrites documents that still contain a
 * `data:` thumbnail, and returns how many it changed.
 */
export async function stripInlinedThumbnails(): Promise<number> {
  const isBlob = (t?: string) => !!t?.startsWith('data:')

  const history = await db().allDocs<WatchHistoryEntry>({
    include_docs: true,
    startkey: 'history-',
    endkey: 'history-￿',
  })
  const staleHistory = history.rows
    .map(r => r.doc!)
    .filter(doc => doc && isBlob(doc.thumbnail))
    .map(doc => ({ ...doc, thumbnail: YT_THUMB(doc.videoId) }))

  const caches = await db().allDocs<ChannelVideoCache>({
    include_docs: true,
    startkey: 'channelcache-',
    endkey: 'channelcache-￿',
  })
  const staleCaches = caches.rows
    .map(r => r.doc!)
    .filter(doc => doc?.videos?.some(v => isBlob(v.thumbnail)))
    .map(doc => ({
      ...doc,
      videos: doc.videos.map(v =>
        isBlob(v.thumbnail) ? { ...v, thumbnail: YT_THUMB(v.videoId) } : v,
      ),
    }))

  const changed = [...staleHistory, ...staleCaches]
  if (changed.length) await db().bulkDocs(changed)
  return changed.length
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: UserSettings = {
  _id: 'settings',
  type: 'settings',
  theme: 'system',
  activePlugin: 'youtubejs',
  startupPage: 'subscriptions',
  defaultQuality: 'best',
  privacyMode: true,
  watchedVideoStyle: 'normal',
  feedSortMode: 'channel',
  feedHideWatched: false,
  channelsHideWatched: false,
  channelPageHideWatched: false,
}

export async function getSettings(): Promise<UserSettings> {
  try {
    return await db().get<UserSettings>('settings')
  } catch {
    const result = await db().put(DEFAULT_SETTINGS)
    return { ...DEFAULT_SETTINGS, _rev: result.rev }
  }
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<void> {
  const current = await getSettings()
  await db().put({ ...current, ...patch })
}

// ─── Subscriptions ────────────────────────────────────────────────────────────
// Each subscription is stored as a doc with _id = `sub-${channelId}`.
// Prefixing allows efficient range-queries without a secondary index.

function subId(channelId: string): string {
  return `sub-${channelId}`
}

export async function getSubscriptions(): Promise<Subscription[]> {
  const result = await db().allDocs<Subscription>({
    include_docs: true,
    startkey: 'sub-',
    endkey: 'sub-￿',
  })
  return result.rows.map(r => r.doc!).filter(Boolean)
    .sort((a, b) => a.channelName.localeCompare(b.channelName))
}

export async function isSubscribed(channelId: string): Promise<boolean> {
  try {
    await db().get(subId(channelId))
    return true
  } catch {
    return false
  }
}

export async function subscribe(
  channelId: string,
  channelName: string,
  avatar?: string,
): Promise<void> {
  const id = subId(channelId)
  let existing: Subscription | undefined
  try { existing = await db().get<Subscription>(id) } catch { /* new */ }

  // Prefer the freshly-supplied avatar; fall back to whatever was stored before
  // so re-subscribing from a page that doesn't have the avatar doesn't erase it.
  const resolvedAvatar = avatar || existing?.avatar
  const doc: Subscription = {
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'subscription',
    channelId,
    channelName,
    ...(resolvedAvatar ? { avatar: resolvedAvatar } : {}),
    subscribedAt: existing?.subscribedAt ?? new Date().toISOString(),
  }
  await db().put(doc)
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('subscriptions-changed'))
}

export async function unsubscribe(channelId: string): Promise<void> {
  try {
    const doc = await db().get(subId(channelId))
    await db().remove(doc)
  } catch {
    // Already gone — treat as success
  }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('subscriptions-changed'))
}

// ─── Watch History ────────────────────────────────────────────────────────────
// Each entry is stored with _id = `history-${videoId}` so the same video
// accumulates watchCount rather than creating duplicate docs.

function historyId(videoId: string): string { return `history-${videoId}` }

function emitHistoryChanged() {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('history-changed'))
}

export async function recordWatch(
  videoId: string,
  title: string,
  channelId: string,
  channelName: string,
  thumbnail: string,
  duration: number,
): Promise<void> {
  const id = historyId(videoId)
  let existing: WatchHistoryEntry | undefined
  try { existing = await db().get<WatchHistoryEntry>(id) } catch { /* new entry */ }
  await db().put<WatchHistoryEntry>({
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'history',
    videoId,
    title,
    channelId,
    channelName,
    thumbnail,
    duration,
    watchedAt: new Date().toISOString(),
    watchCount: (existing?.watchCount ?? 0) + 1,
  })
  emitHistoryChanged()
}

export async function getHistory(): Promise<WatchHistoryEntry[]> {
  const result = await db().allDocs<WatchHistoryEntry>({
    include_docs: true,
    startkey: 'history-',
    endkey: 'history-￿',
  })
  return result.rows
    .map(r => r.doc!)
    .filter(Boolean)
    .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))
}

export interface HistoryPage {
  entries: WatchHistoryEntry[]
  total: number
}

/**
 * Returns the most recently watched entries, newest first.
 *
 * Docs are keyed by video id (so rewatches dedupe), which means `allDocs`
 * cannot return them in watch order. We therefore read the keys — cheap, no
 * document bodies — sort by the `watchedAt` embedded in each key's metadata,
 * and only load bodies for the slice actually being displayed.
 */
export async function getHistoryPage(limit: number, offset = 0): Promise<HistoryPage> {
  // Bodies are needed to sort by watchedAt, but only ids come back here.
  const index = await db().allDocs<WatchHistoryEntry>({
    include_docs: true,
    startkey: 'history-',
    endkey: 'history-￿',
  })

  const sorted = index.rows
    .map(r => r.doc!)
    .filter(Boolean)
    .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))

  return {
    entries: sorted.slice(offset, offset + limit),
    total: sorted.length,
  }
}

/**
 * Channel ids the user has watched at least one video from.
 *
 * Still reads every history document — PouchDB can't project single fields
 * without a map/reduce view. It is fast now only because the documents no
 * longer carry inlined thumbnails (see {@link stripInlinedThumbnails}).
 */
export async function getWatchedChannelIds(): Promise<Set<string>> {
  const result = await db().allDocs<WatchHistoryEntry>({
    include_docs: true,
    startkey: 'history-',
    endkey: 'history-￿',
  })
  const ids = new Set<string>()
  for (const row of result.rows) {
    if (row.doc?.channelId) ids.add(row.doc.channelId)
  }
  return ids
}

export async function getWatchedVideoIds(): Promise<Set<string>> {
  const result = await db().allDocs({ startkey: 'history-', endkey: 'history-￿' })
  return new Set(result.rows.map(r => (r.id as string).slice('history-'.length)))
}

export async function removeFromHistory(videoId: string): Promise<void> {
  try {
    const doc = await db().get(historyId(videoId))
    await db().remove(doc)
    emitHistoryChanged()
  } catch { /* already gone */ }
}

export async function updateHistoryThumbnail(videoId: string, thumbnail: string): Promise<void> {
  try {
    const existing = await db().get<WatchHistoryEntry>(historyId(videoId))
    await db().put({ ...existing, thumbnail })
  } catch { /* entry already gone — ignore */ }
}

export async function clearHistory(): Promise<void> {
  const result = await db().allDocs({ startkey: 'history-', endkey: 'history-￿' })
  await Promise.all(result.rows.map(r => db().remove(r.id as string, r.value.rev)))
  emitHistoryChanged()
}

// ─── Channel Video Cache ──────────────────────────────────────────────────────
// Stale-while-revalidate: pages read cache on mount for instant display,
// then write fresh data back after network fetch completes.

function cacheId(channelId: string): string { return `channelcache-${channelId}` }

export async function getCachedChannelVideos(channelId: string): Promise<CachedVideo[] | null> {
  try {
    const doc = await db().get<ChannelVideoCache>(cacheId(channelId))
    return doc.videos
  } catch {
    return null
  }
}

export async function setCachedChannelVideos(channelId: string, videos: CachedVideo[]): Promise<void> {
  const id = cacheId(channelId)
  let existing: ChannelVideoCache | undefined
  try { existing = await db().get<ChannelVideoCache>(id) } catch { /* new */ }
  await db().put<ChannelVideoCache>({
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'channelcache',
    channelId,
    videos,
    fetchedAt: new Date().toISOString(),
  })
}

export async function getAllCachedChannelVideos(): Promise<Map<string, CachedVideo[]>> {
  const result = await db().allDocs<ChannelVideoCache>({
    include_docs: true,
    startkey: 'channelcache-',
    endkey: 'channelcache-￿',
  })
  const map = new Map<string, CachedVideo[]>()
  for (const row of result.rows) {
    if (row.doc) map.set(row.doc.channelId, row.doc.videos)
  }
  return map
}

/** How long a channel's cached video list is considered fresh. */
export const CHANNEL_CACHE_TTL_MS = 30 * 60 * 1000

/**
 * Returns the channel ids whose cache is missing or older than the TTL.
 *
 * Refreshing a channel costs an API call plus its thumbnails, so refetching all
 * of them on every visit made the feed slow to open. Only stale channels are
 * refreshed; the rest render straight from the cache.
 */
export async function getStaleChannelIds(
  channelIds: string[],
  ttlMs: number = CHANNEL_CACHE_TTL_MS,
): Promise<Set<string>> {
  const result = await db().allDocs<ChannelVideoCache>({
    include_docs: true,
    startkey: 'channelcache-',
    endkey: 'channelcache-￿',
  })

  const freshCutoff = Date.now() - ttlMs
  const fresh = new Set<string>()
  for (const row of result.rows) {
    const doc = row.doc
    if (!doc?.fetchedAt) continue
    const fetchedAt = Date.parse(doc.fetchedAt)
    // An unparseable or future timestamp is treated as stale rather than trusted.
    if (Number.isFinite(fetchedAt) && fetchedAt >= freshCutoff && fetchedAt <= Date.now()) {
      fresh.add(doc.channelId)
    }
  }

  return new Set(channelIds.filter(id => !fresh.has(id)))
}

// ─── P2P Sync ─────────────────────────────────────────────────────────────────

export function syncWith(remoteUrl: string) {
  return db().sync(remoteUrl, { live: true, retry: true })
}
