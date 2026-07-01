// pouchdb-browser uses IndexedDB — the correct adapter for all browser/Electron targets.
// Tests import pouchdb directly with the memory adapter (see src/test/db.test.ts).
import PouchDB from 'pouchdb-browser'
import type { UserSettings, Subscription, WatchHistoryEntry } from '../types'

// Lazy singleton — deferred until first use so tests that mock this module
// never trigger the IndexedDB constructor in jsdom.
let _db: PouchDB.Database | null = null
function db(): PouchDB.Database {
  if (!_db) _db = new PouchDB('neotube')
  return _db
}

// ─── Settings ─────────────────────────────────────────────────────────────────

const DEFAULT_SETTINGS: UserSettings = {
  _id: 'settings',
  type: 'settings',
  theme: 'system',
  activePlugin: 'youtubejs',
  defaultQuality: 'best',
  privacyMode: true,
  watchedVideoStyle: 'normal',
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

export async function clearHistory(): Promise<void> {
  const result = await db().allDocs({ startkey: 'history-', endkey: 'history-￿' })
  await Promise.all(result.rows.map(r => db().remove(r.id as string, r.value.rev)))
  emitHistoryChanged()
}

// ─── P2P Sync ─────────────────────────────────────────────────────────────────

export function syncWith(remoteUrl: string) {
  return db().sync(remoteUrl, { live: true, retry: true })
}
