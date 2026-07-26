import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import PouchDB from 'pouchdb'
// @ts-expect-error — no type declaration for pouchdb-adapter-memory
import MemoryAdapter from 'pouchdb-adapter-memory'

PouchDB.plugin(MemoryAdapter)

const db = new PouchDB('refresher-test', { adapter: 'memory' })
vi.mock('../src/db/client', () => ({ db: () => db }))

const getChannelInfo = vi.fn()
const getVideoInfo = vi.fn()
vi.mock('../src/plugins/manager', () => ({
  pluginManager: { getActive: () => ({ getChannelInfo, getVideoInfo }) },
}))

const getSubscriptions = vi.fn().mockResolvedValue([])
const getHistory = vi.fn().mockResolvedValue([])
vi.mock('../src/db/index', () => ({ getSubscriptions, getHistory }))

const { refreshStaleOnce, backfillOnce, startRefresher, stopRefresher, isRefresherRunning } =
  await import('../src/services/refresher')
const { setMetadata, getMetadata, METADATA_TTL_MS, MAX_FAILURES } =
  await import('../src/db/metadata')

async function reset() {
  const all = await db.allDocs()
  await Promise.all(all.rows.map(r => db.remove(r.id, r.value.rev)))
  vi.clearAllMocks()
  getSubscriptions.mockResolvedValue([])
  getHistory.mockResolvedValue([])
}

async function ageEntry(kind: string, refId: string, ms: number) {
  const doc = await db.get<{ fetchedAt: string }>(`metadata-${kind}-${refId}`)
  await db.put({ ...doc, fetchedAt: new Date(Date.now() - ms).toISOString() })
}

// Zero spacing keeps the suite fast; the real default paces requests.
const FAST = { requestSpacingMs: 0 }

describe('refreshStaleOnce', () => {
  beforeEach(reset)

  it('does nothing when no entry is stale', async () => {
    await setMetadata('channel', 'c1', { name: 'A' })
    expect(await refreshStaleOnce(FAST)).toBe(0)
    expect(getChannelInfo).not.toHaveBeenCalled()
  })

  it('refreshes a stale entry and stores the new value', async () => {
    await setMetadata('channel', 'c1', { name: 'Old' })
    await ageEntry('channel', 'c1', METADATA_TTL_MS.channel + 60_000)
    getChannelInfo.mockResolvedValue({ name: 'New' })

    expect(await refreshStaleOnce(FAST)).toBe(1)
    expect((await getMetadata('channel', 'c1'))?.data).toEqual({ name: 'New' })
  })

  it('respects the batch size', async () => {
    for (const id of ['a', 'b', 'c']) {
      await setMetadata('channel', id, {})
      await ageEntry('channel', id, METADATA_TTL_MS.channel + 60_000)
    }
    getChannelInfo.mockResolvedValue({ name: 'X' })

    expect(await refreshStaleOnce({ ...FAST, batchSize: 2 })).toBe(2)
    expect(getChannelInfo).toHaveBeenCalledTimes(2)
  })

  it('records a failure and keeps going', async () => {
    for (const id of ['bad', 'good']) {
      await setMetadata('channel', id, {})
    }
    // 'bad' is older, so it is attempted first.
    await ageEntry('channel', 'bad', METADATA_TTL_MS.channel + 600_000)
    await ageEntry('channel', 'good', METADATA_TTL_MS.channel + 60_000)

    getChannelInfo
      .mockRejectedValueOnce(new Error('gone'))
      .mockResolvedValueOnce({ name: 'ok' })

    expect(await refreshStaleOnce(FAST)).toBe(1)
    expect((await getMetadata('channel', 'bad'))?.failures).toBe(1)
  })
})

describe('backfillOnce', () => {
  beforeEach(reset)

  it('caches subscriptions that have no entry', async () => {
    getSubscriptions.mockResolvedValue([{ channelId: 'c1' }, { channelId: 'c2' }])
    getChannelInfo.mockResolvedValue({ name: 'X' })

    expect(await backfillOnce(FAST)).toBe(2)
    expect(await getMetadata('channel', 'c1')).not.toBeNull()
  })

  // Subscriptions drive the feed, so they are warmed before history.
  it('leaves history alone until every subscription is cached', async () => {
    getSubscriptions.mockResolvedValue([{ channelId: 'c1' }])
    getHistory.mockResolvedValue([{ videoId: 'v1' }])
    getChannelInfo.mockResolvedValue({ name: 'X' })

    await backfillOnce(FAST)
    expect(getVideoInfo).not.toHaveBeenCalled()
  })

  it('moves on to history once subscriptions are done', async () => {
    getSubscriptions.mockResolvedValue([{ channelId: 'c1' }])
    getHistory.mockResolvedValue([{ videoId: 'v1' }])
    await setMetadata('channel', 'c1', { name: 'cached' })
    getVideoInfo.mockResolvedValue({ title: 'V' })

    expect(await backfillOnce(FAST)).toBe(1)
    expect(await getMetadata('video', 'v1')).not.toBeNull()
  })

  it('caps each pass at the batch size so a big history fills in gradually', async () => {
    getSubscriptions.mockResolvedValue([])
    getHistory.mockResolvedValue(
      Array.from({ length: 50 }, (_, i) => ({ videoId: `v${i}` })),
    )
    getVideoInfo.mockResolvedValue({ title: 'V' })

    expect(await backfillOnce({ ...FAST, batchSize: 5 })).toBe(5)
  })

  it('does nothing when everything is already cached', async () => {
    getSubscriptions.mockResolvedValue([{ channelId: 'c1' }])
    getHistory.mockResolvedValue([])
    await setMetadata('channel', 'c1', {})

    expect(await backfillOnce(FAST)).toBe(0)
  })
})

describe('startRefresher', () => {
  afterEach(() => { stopRefresher(); vi.useRealTimers() })

  it('reports running state and stops cleanly', () => {
    expect(isRefresherRunning()).toBe(false)
    startRefresher()
    expect(isRefresherRunning()).toBe(true)
    stopRefresher()
    expect(isRefresherRunning()).toBe(false)
  })

  it('ignores a second start while already running', () => {
    startRefresher()
    startRefresher()
    stopRefresher()
    expect(isRefresherRunning()).toBe(false)
  })
})

describe('failure backoff', () => {
  beforeEach(reset)

  it('stops attempting an entry after repeated failures', async () => {
    await setMetadata('channel', 'broken', {})
    await ageEntry('channel', 'broken', METADATA_TTL_MS.channel + 60_000)
    getChannelInfo.mockRejectedValue(new Error('gone'))

    for (let i = 0; i < MAX_FAILURES; i++) await refreshStaleOnce(FAST)
    const callsBefore = getChannelInfo.mock.calls.length

    await refreshStaleOnce(FAST)
    expect(getChannelInfo.mock.calls.length).toBe(callsBefore)
  })
})
