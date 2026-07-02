import { describe, it, expect, beforeEach } from 'vitest'
import PouchDB from 'pouchdb'
// @ts-expect-error — no type declaration for pouchdb-adapter-memory
import MemoryAdapter from 'pouchdb-adapter-memory'
import type { UserSettings, Subscription, WatchHistoryEntry } from '../src/types'

PouchDB.plugin(MemoryAdapter)

function makeTestDb() {
  return new PouchDB(`test-${Math.random()}`, { adapter: 'memory' })
}

// ─── Settings helpers (mirror src/db/index.ts logic) ─────────────────────────

const DEFAULT: UserSettings = {
  _id: 'settings',
  type: 'settings',
  theme: 'system',
  activePlugin: 'youtubejs',
  defaultQuality: 'best',
  privacyMode: true,
}

async function getSettings(db: PouchDB.Database): Promise<UserSettings> {
  try {
    return await db.get<UserSettings>('settings')
  } catch {
    const result = await db.put(DEFAULT)
    return { ...DEFAULT, _rev: result.rev }
  }
}

async function saveSettings(db: PouchDB.Database, patch: Partial<UserSettings>): Promise<void> {
  const current = await getSettings(db)
  await db.put({ ...current, ...patch })
}

// ─── Subscription helpers (mirror src/db/index.ts logic) ─────────────────────

function subId(channelId: string) { return `sub-${channelId}` }

async function getSubscriptions(db: PouchDB.Database): Promise<Subscription[]> {
  const result = await db.allDocs<Subscription>({
    include_docs: true,
    startkey: 'sub-',
    endkey: 'sub-￿',
  })
  return result.rows.map(r => r.doc!).filter(Boolean)
}

async function isSubscribed(db: PouchDB.Database, channelId: string): Promise<boolean> {
  try { await db.get(subId(channelId)); return true } catch { return false }
}

async function subscribe(db: PouchDB.Database, channelId: string, channelName: string): Promise<void> {
  const id = subId(channelId)
  let existing: Subscription | undefined
  try { existing = await db.get<Subscription>(id) } catch { /* new */ }
  await db.put({
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'subscription',
    channelId,
    channelName,
    subscribedAt: existing?.subscribedAt ?? new Date().toISOString(),
  })
}

async function unsubscribe(db: PouchDB.Database, channelId: string): Promise<void> {
  try { const doc = await db.get(subId(channelId)); await db.remove(doc) } catch { /* already gone */ }
}

// ─── Watch History helpers (mirror src/db/index.ts logic) ────────────────────

function historyId(videoId: string) { return `history-${videoId}` }

async function recordWatch(
  db: PouchDB.Database,
  videoId: string,
  title: string,
  channelId: string,
  channelName: string,
  thumbnail: string,
  duration: number,
): Promise<void> {
  const id = historyId(videoId)
  let existing: WatchHistoryEntry | undefined
  try { existing = await db.get<WatchHistoryEntry>(id) } catch { /* new */ }
  await db.put<WatchHistoryEntry>({
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'history',
    videoId, title, channelId, channelName, thumbnail, duration,
    watchedAt: new Date().toISOString(),
    watchCount: (existing?.watchCount ?? 0) + 1,
  })
}

async function getHistory(db: PouchDB.Database): Promise<WatchHistoryEntry[]> {
  const result = await db.allDocs<WatchHistoryEntry>({
    include_docs: true, startkey: 'history-', endkey: 'history-￿',
  })
  return result.rows.map(r => r.doc!).filter(Boolean)
    .sort((a, b) => b.watchedAt.localeCompare(a.watchedAt))
}

async function getWatchedVideoIds(db: PouchDB.Database): Promise<Set<string>> {
  const result = await db.allDocs({ startkey: 'history-', endkey: 'history-￿' })
  return new Set(result.rows.map(r => (r.id as string).slice('history-'.length)))
}

async function removeFromHistory(db: PouchDB.Database, videoId: string): Promise<void> {
  try { const doc = await db.get(historyId(videoId)); await db.remove(doc) } catch { /* gone */ }
}

async function clearHistory(db: PouchDB.Database): Promise<void> {
  const result = await db.allDocs({ startkey: 'history-', endkey: 'history-￿' })
  await Promise.all(result.rows.map(r => db.remove(r.id as string, r.value.rev)))
}

// ─── Settings tests ───────────────────────────────────────────────────────────

describe('settings db', () => {
  let db: PouchDB.Database

  beforeEach(() => { db = makeTestDb() })

  it('returns default settings on first read', async () => {
    const s = await getSettings(db)
    expect(s.theme).toBe('system')
    expect(s.privacyMode).toBe(true)
  })

  it('saves and retrieves theme preference', async () => {
    await saveSettings(db, { theme: 'dark' })
    expect((await getSettings(db)).theme).toBe('dark')
  })

  it('partial save does not overwrite unrelated fields', async () => {
    await saveSettings(db, { theme: 'dark' })
    await saveSettings(db, { defaultQuality: '720p' })
    const s = await getSettings(db)
    expect(s.theme).toBe('dark')
    expect(s.defaultQuality).toBe('720p')
    expect(s.privacyMode).toBe(true)
  })

  it('save is idempotent — updates existing doc without conflict', async () => {
    await saveSettings(db, { theme: 'light' })
    await saveSettings(db, { theme: 'dark' })
    expect((await getSettings(db)).theme).toBe('dark')
  })
})

// ─── Subscription tests ───────────────────────────────────────────────────────

describe('subscriptions db', () => {
  let db: PouchDB.Database

  beforeEach(() => { db = makeTestDb() })

  it('returns empty list when no subscriptions', async () => {
    expect(await getSubscriptions(db)).toEqual([])
  })

  it('isSubscribed returns false for unknown channel', async () => {
    expect(await isSubscribed(db, 'UCxxx')).toBe(false)
  })

  it('subscribe stores the channel', async () => {
    await subscribe(db, 'UCabc', 'Test Channel')
    const subs = await getSubscriptions(db)
    expect(subs).toHaveLength(1)
    expect(subs[0].channelId).toBe('UCabc')
    expect(subs[0].channelName).toBe('Test Channel')
  })

  it('isSubscribed returns true after subscribing', async () => {
    await subscribe(db, 'UCabc', 'Test Channel')
    expect(await isSubscribed(db, 'UCabc')).toBe(true)
  })

  it('subscribe twice does not create duplicate (idempotent)', async () => {
    await subscribe(db, 'UCabc', 'Test Channel')
    await subscribe(db, 'UCabc', 'Test Channel Updated')
    const subs = await getSubscriptions(db)
    expect(subs).toHaveLength(1)
    expect(subs[0].channelName).toBe('Test Channel Updated')
  })

  it('unsubscribe removes the channel', async () => {
    await subscribe(db, 'UCabc', 'Test Channel')
    await unsubscribe(db, 'UCabc')
    expect(await getSubscriptions(db)).toHaveLength(0)
    expect(await isSubscribed(db, 'UCabc')).toBe(false)
  })

  it('unsubscribe on non-existent channel does not throw', async () => {
    await expect(unsubscribe(db, 'UCnope')).resolves.not.toThrow()
  })

  it('can manage multiple subscriptions independently', async () => {
    await subscribe(db, 'UC1', 'Channel One')
    await subscribe(db, 'UC2', 'Channel Two')
    await subscribe(db, 'UC3', 'Channel Three')
    await unsubscribe(db, 'UC2')
    const subs = await getSubscriptions(db)
    expect(subs).toHaveLength(2)
    expect(subs.map(s => s.channelId)).not.toContain('UC2')
  })
})

// ─── Watch History tests ──────────────────────────────────────────────────────

describe('watch history db', () => {
  let db: PouchDB.Database

  beforeEach(() => { db = makeTestDb() })

  const rec = (videoId: string, title = 'Title') =>
    recordWatch(db, videoId, title, 'UC1', 'Chan', '', 120)

  it('returns empty history on first read', async () => {
    expect(await getHistory(db)).toEqual([])
  })

  it('getWatchedVideoIds returns empty set initially', async () => {
    const ids = await getWatchedVideoIds(db)
    expect(ids.size).toBe(0)
  })

  it('records a watched video', async () => {
    await rec('vid1', 'My Video')
    const history = await getHistory(db)
    expect(history).toHaveLength(1)
    expect(history[0].videoId).toBe('vid1')
    expect(history[0].title).toBe('My Video')
    expect(history[0].watchCount).toBe(1)
  })

  it('increments watchCount on re-watch', async () => {
    await rec('vid1')
    await rec('vid1')
    await rec('vid1')
    const history = await getHistory(db)
    expect(history).toHaveLength(1)
    expect(history[0].watchCount).toBe(3)
  })

  it('getWatchedVideoIds includes recorded video', async () => {
    await rec('vid1')
    const ids = await getWatchedVideoIds(db)
    expect(ids.has('vid1')).toBe(true)
  })

  it('getWatchedVideoIds excludes unrecorded video', async () => {
    await rec('vid1')
    const ids = await getWatchedVideoIds(db)
    expect(ids.has('vid2')).toBe(false)
  })

  it('removeFromHistory deletes a single entry', async () => {
    await rec('vid1')
    await rec('vid2')
    await removeFromHistory(db, 'vid1')
    const history = await getHistory(db)
    expect(history).toHaveLength(1)
    expect(history[0].videoId).toBe('vid2')
  })

  it('removeFromHistory on missing entry does not throw', async () => {
    await expect(removeFromHistory(db, 'nope')).resolves.not.toThrow()
  })

  it('clearHistory removes all entries', async () => {
    await rec('vid1')
    await rec('vid2')
    await rec('vid3')
    await clearHistory(db)
    expect(await getHistory(db)).toHaveLength(0)
    expect((await getWatchedVideoIds(db)).size).toBe(0)
  })

  it('history is sorted newest first', async () => {
    await rec('vid1')
    await new Promise(r => setTimeout(r, 5))
    await rec('vid2')
    const history = await getHistory(db)
    expect(history[0].videoId).toBe('vid2')
    expect(history[1].videoId).toBe('vid1')
  })
})
