import { describe, it, expect, vi, beforeEach } from 'vitest'
import PouchDB from 'pouchdb'
// @ts-expect-error — no type declaration for pouchdb-adapter-memory
import MemoryAdapter from 'pouchdb-adapter-memory'

PouchDB.plugin(MemoryAdapter)

// src/db/index.ts constructs a PouchDB against IndexedDB, which jsdom lacks.
// Substitute the memory adapter so the real caching code is what gets tested.
const db = new PouchDB('channel-cache-test', { adapter: 'memory' })
vi.mock('pouchdb-browser', () => ({
  default: class {
    constructor() { return db }
  },
}))

const { getStaleChannelIds, setCachedChannelVideos, stripInlinedThumbnails, CHANNEL_CACHE_TTL_MS } =
  await import('../src/db/index')

async function reset() {
  const all = await db.allDocs()
  await Promise.all(all.rows.map(r => db.remove(r.id, r.value.rev)))
}

describe('getStaleChannelIds', () => {
  beforeEach(reset)

  it('treats a channel with no cache as stale', async () => {
    expect(await getStaleChannelIds(['ch1'])).toEqual(new Set(['ch1']))
  })

  it('treats a freshly cached channel as fresh', async () => {
    await setCachedChannelVideos('ch1', [])
    expect(await getStaleChannelIds(['ch1'])).toEqual(new Set())
  })

  it('treats a cache older than the TTL as stale', async () => {
    await setCachedChannelVideos('ch1', [])
    const doc = await db.get<{ fetchedAt: string }>('channelcache-ch1')
    await db.put({
      ...doc,
      fetchedAt: new Date(Date.now() - CHANNEL_CACHE_TTL_MS - 60_000).toISOString(),
    })
    expect(await getStaleChannelIds(['ch1'])).toEqual(new Set(['ch1']))
  })

  it('distinguishes fresh from stale across several channels', async () => {
    await setCachedChannelVideos('fresh', [])
    await setCachedChannelVideos('old', [])
    const doc = await db.get<{ fetchedAt: string }>('channelcache-old')
    await db.put({ ...doc, fetchedAt: new Date(Date.now() - 86_400_000).toISOString() })

    const stale = await getStaleChannelIds(['fresh', 'old', 'never-cached'])
    expect(stale).toEqual(new Set(['old', 'never-cached']))
  })

  it('treats an unparseable timestamp as stale rather than trusting it', async () => {
    await setCachedChannelVideos('ch1', [])
    const doc = await db.get<{ fetchedAt: string }>('channelcache-ch1')
    await db.put({ ...doc, fetchedAt: 'not a date' })
    expect(await getStaleChannelIds(['ch1'])).toEqual(new Set(['ch1']))
  })
})

describe('stripInlinedThumbnails', () => {
  beforeEach(reset)

  const BLOB = 'data:image/jpeg;base64,AAAA'

  it('replaces inlined history thumbnails with URLs', async () => {
    await db.put({
      _id: 'history-abc', type: 'history', videoId: 'abc', title: 'T',
      channelId: 'c', channelName: 'C', thumbnail: BLOB, duration: 1,
      watchedAt: new Date().toISOString(), watchCount: 1,
    })

    expect(await stripInlinedThumbnails()).toBe(1)
    const doc = await db.get<{ thumbnail: string }>('history-abc')
    expect(doc.thumbnail).toBe('https://i.ytimg.com/vi/abc/hqdefault.jpg')
  })

  it('replaces inlined thumbnails inside channel caches', async () => {
    await setCachedChannelVideos('ch1', [
      { videoId: 'v1', title: 'A', channelId: 'ch1', channelName: 'C', thumbnail: BLOB, duration: 1 },
      { videoId: 'v2', title: 'B', channelId: 'ch1', channelName: 'C', thumbnail: 'https://ok/x.jpg', duration: 1 },
    ])

    expect(await stripInlinedThumbnails()).toBe(1)
    const doc = await db.get<{ videos: Array<{ thumbnail: string }> }>('channelcache-ch1')
    expect(doc.videos[0].thumbnail).toBe('https://i.ytimg.com/vi/v1/hqdefault.jpg')
    // An already-clean URL is left untouched.
    expect(doc.videos[1].thumbnail).toBe('https://ok/x.jpg')
  })

  it('is a no-op when nothing is inlined', async () => {
    await setCachedChannelVideos('ch1', [
      { videoId: 'v1', title: 'A', channelId: 'ch1', channelName: 'C', thumbnail: 'https://ok/x.jpg', duration: 1 },
    ])
    expect(await stripInlinedThumbnails()).toBe(0)
  })

  it('is safe to run twice', async () => {
    await db.put({
      _id: 'history-abc', type: 'history', videoId: 'abc', title: 'T',
      channelId: 'c', channelName: 'C', thumbnail: BLOB, duration: 1,
      watchedAt: new Date().toISOString(), watchCount: 1,
    })
    expect(await stripInlinedThumbnails()).toBe(1)
    expect(await stripInlinedThumbnails()).toBe(0)
  })
})
