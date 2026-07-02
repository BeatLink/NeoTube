import PouchDB from 'pouchdb'
import { homedir } from 'os'
import { join } from 'path'
import type { UserSettings, Subscription, WatchHistoryEntry, CachedVideo, ChannelVideoCache } from './types.js'

// ─── Database singleton ───────────────────────────────────────────────────────

const dbPath = process.env.NEOTUBE_DB_PATH ?? join(homedir(), '.neotube', 'db')

let _db: PouchDB.Database | null = null
function db(): PouchDB.Database {
  if (!_db) _db = new PouchDB(dbPath)
  return _db
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: UserSettings = {
  _id: 'settings',
  type: 'settings',
  theme: 'system',
  activeBackend: 'youtubejs',
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

function subId(channelId: string): string { return `sub-${channelId}` }

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
  try { await db().get(subId(channelId)); return true } catch { return false }
}

export async function subscribe(channelId: string, channelName: string, avatar?: string): Promise<void> {
  const id = subId(channelId)
  let existing: Subscription | undefined
  try { existing = await db().get<Subscription>(id) } catch { /* new */ }
  const resolvedAvatar = avatar || existing?.avatar
  await db().put<Subscription>({
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'subscription',
    channelId,
    channelName,
    ...(resolvedAvatar ? { avatar: resolvedAvatar } : {}),
    subscribedAt: existing?.subscribedAt ?? new Date().toISOString(),
  })
}

export async function unsubscribe(channelId: string): Promise<void> {
  try {
    const doc = await db().get(subId(channelId))
    await db().remove(doc)
  } catch { /* already gone */ }
}

// ─── Watch History ────────────────────────────────────────────────────────────

function historyId(videoId: string): string { return `history-${videoId}` }

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
  try { existing = await db().get<WatchHistoryEntry>(id) } catch { /* new */ }
  await db().put<WatchHistoryEntry>({
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'history',
    videoId, title, channelId, channelName, thumbnail, duration,
    watchedAt: new Date().toISOString(),
    watchCount: (existing?.watchCount ?? 0) + 1,
  })
}

export async function getHistory(): Promise<WatchHistoryEntry[]> {
  const result = await db().allDocs<WatchHistoryEntry>({
    include_docs: true,
    startkey: 'history-',
    endkey: 'history-￿',
  })
  return result.rows.map(r => r.doc!).filter(Boolean)
    .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))
}

export async function getWatchedVideoIds(): Promise<string[]> {
  const result = await db().allDocs({ startkey: 'history-', endkey: 'history-￿' })
  return result.rows.map(r => (r.id as string).slice('history-'.length))
}

export async function removeFromHistory(videoId: string): Promise<void> {
  try {
    const doc = await db().get(historyId(videoId))
    await db().remove(doc)
  } catch { /* already gone */ }
}

export async function clearHistory(): Promise<void> {
  const result = await db().allDocs({ startkey: 'history-', endkey: 'history-￿' })
  await Promise.all(result.rows.map(r => db().remove(r.id as string, r.value.rev)))
}

// ─── Channel Video Cache ──────────────────────────────────────────────────────

function cacheId(channelId: string): string { return `channelcache-${channelId}` }

export async function getCachedChannelVideos(channelId: string): Promise<CachedVideo[] | null> {
  try {
    const doc = await db().get<ChannelVideoCache>(cacheId(channelId))
    return doc.videos
  } catch { return null }
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

// ─── P2P Sync ─────────────────────────────────────────────────────────────────

export function syncWith(remoteUrl: string) {
  return db().sync(remoteUrl, { live: true, retry: true })
}
