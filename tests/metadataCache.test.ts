import { describe, it, expect, vi, beforeEach } from 'vitest'
import PouchDB from 'pouchdb'
// @ts-expect-error — no type declaration for pouchdb-adapter-memory
import MemoryAdapter from 'pouchdb-adapter-memory'

PouchDB.plugin(MemoryAdapter)

const db = new PouchDB('metadata-cache-test', { adapter: 'memory' })
vi.mock('../src/db/client', () => ({ db: () => db }))

const {
  getMetadata, setMetadata, getOrFetchMetadata, getStaleMetadata,
  getUncachedIds, recordMetadataFailure, getMetadataStats, isFresh,
  MAX_FAILURES, METADATA_TTL_MS, METADATA_VERSION,
} = await import('../src/db/metadata')

async function reset() {
  const all = await db.allDocs()
  await Promise.all(all.rows.map(r => db.remove(r.id, r.value.rev)))
}

/** Backdates an entry so it reads as stale. */
async function ageEntry(kind: string, refId: string, ms: number) {
  const doc = await db.get<{ fetchedAt: string }>(`metadata-${kind}-${refId}`)
  await db.put({ ...doc, fetchedAt: new Date(Date.now() - ms).toISOString() })
}

describe('isFresh', () => {
  const current = (fetchedAt: string) => ({ fetchedAt, version: METADATA_VERSION })

  it('accepts a recent timestamp', () => {
    expect(isFresh(current(new Date().toISOString()), 60_000)).toBe(true)
  })

  it('rejects one older than the TTL', () => {
    expect(isFresh(current(new Date(Date.now() - 120_000).toISOString()), 60_000)).toBe(false)
  })

  it('rejects an unparseable timestamp', () => {
    expect(isFresh(current('nonsense'), 60_000)).toBe(false)
  })

  // A clock change could otherwise leave an entry permanently "fresh".
  it('rejects a future timestamp', () => {
    expect(isFresh(current(new Date(Date.now() + 600_000).toISOString()), 60_000)).toBe(false)
  })

  // Without this, a cached payload written before a type gained fields would be
  // served forever, silently missing them.
  it('rejects a payload written by an older shape version', () => {
    const recent = new Date().toISOString()
    expect(isFresh({ fetchedAt: recent, version: METADATA_VERSION - 1 }, 60_000)).toBe(false)
    expect(isFresh({ fetchedAt: recent, version: METADATA_VERSION }, 60_000)).toBe(true)
  })

  // Entries predate the version field entirely.
  it('treats a versionless entry as outdated', () => {
    expect(isFresh({ fetchedAt: new Date().toISOString() }, 60_000)).toBe(false)
  })
})

describe('getOrFetchMetadata', () => {
  beforeEach(reset)

  it('fetches and stores on a miss', async () => {
    const fetcher = vi.fn().mockResolvedValue({ name: 'Chan' })
    const result = await getOrFetchMetadata('channel', 'c1', fetcher)

    expect(result).toEqual({ name: 'Chan' })
    expect(fetcher).toHaveBeenCalledOnce()
    expect((await getMetadata('channel', 'c1'))?.data).toEqual({ name: 'Chan' })
  })

  it('serves a fresh entry without fetching', async () => {
    await setMetadata('channel', 'c1', { name: 'Cached' })
    const fetcher = vi.fn()

    expect(await getOrFetchMetadata('channel', 'c1', fetcher)).toEqual({ name: 'Cached' })
    expect(fetcher).not.toHaveBeenCalled()
  })

  it('refetches once the entry is stale', async () => {
    await setMetadata('channel', 'c1', { name: 'Old' })
    await ageEntry('channel', 'c1', METADATA_TTL_MS.channel + 60_000)

    const fetcher = vi.fn().mockResolvedValue({ name: 'New' })
    expect(await getOrFetchMetadata('channel', 'c1', fetcher)).toEqual({ name: 'New' })
    expect(fetcher).toHaveBeenCalledOnce()
  })

  // Stale data beats an error message.
  it('falls back to the stale copy when the fetch fails', async () => {
    await setMetadata('channel', 'c1', { name: 'Old' })
    await ageEntry('channel', 'c1', METADATA_TTL_MS.channel + 60_000)

    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    expect(await getOrFetchMetadata('channel', 'c1', fetcher)).toEqual({ name: 'Old' })
  })

  it('propagates the error when nothing is cached', async () => {
    const fetcher = vi.fn().mockRejectedValue(new Error('offline'))
    await expect(getOrFetchMetadata('channel', 'c1', fetcher)).rejects.toThrow('offline')
  })

  it('clears the failure streak after a success', async () => {
    await setMetadata('channel', 'c1', { name: 'A' })
    await recordMetadataFailure('channel', 'c1')
    expect((await getMetadata('channel', 'c1'))?.failures).toBe(1)

    await setMetadata('channel', 'c1', { name: 'B' })
    expect((await getMetadata('channel', 'c1'))?.failures).toBe(0)
  })
})

describe('getStaleMetadata', () => {
  beforeEach(reset)

  it('returns nothing when everything is fresh', async () => {
    await setMetadata('channel', 'c1', {})
    expect(await getStaleMetadata(10)).toEqual([])
  })

  it('returns the stale entries oldest first', async () => {
    await setMetadata('channel', 'newer', {})
    await setMetadata('channel', 'older', {})
    await ageEntry('channel', 'newer', METADATA_TTL_MS.channel + 60_000)
    await ageEntry('channel', 'older', METADATA_TTL_MS.channel + 600_000)

    expect((await getStaleMetadata(10)).map(e => e.refId)).toEqual(['older', 'newer'])
  })

  it('honours the limit', async () => {
    for (const id of ['a', 'b', 'c']) {
      await setMetadata('channel', id, {})
      await ageEntry('channel', id, METADATA_TTL_MS.channel + 60_000)
    }
    expect(await getStaleMetadata(2)).toHaveLength(2)
  })

  // Deleted or private videos would otherwise be retried forever.
  it('skips entries that keep failing', async () => {
    await setMetadata('channel', 'broken', {})
    await ageEntry('channel', 'broken', METADATA_TTL_MS.channel + 60_000)
    for (let i = 0; i < MAX_FAILURES; i++) await recordMetadataFailure('channel', 'broken')

    expect(await getStaleMetadata(10)).toEqual([])
  })

  it('applies the TTL for each kind', async () => {
    await setMetadata('channel', 'c1', {})
    await setMetadata('video', 'v1', {})
    // Older than the channel TTL, well inside the video TTL.
    const age = METADATA_TTL_MS.channel + 60_000
    await ageEntry('channel', 'c1', age)
    await ageEntry('video', 'v1', age)

    expect((await getStaleMetadata(10)).map(e => e.refId)).toEqual(['c1'])
  })
})

describe('getUncachedIds', () => {
  beforeEach(reset)

  it('returns only the ids with no entry', async () => {
    await setMetadata('channel', 'cached', {})
    expect(await getUncachedIds('channel', ['cached', 'missing'])).toEqual(['missing'])
  })

  it('does not treat another kind as a hit', async () => {
    await setMetadata('video', 'x1', {})
    expect(await getUncachedIds('channel', ['x1'])).toEqual(['x1'])
  })
})

describe('getMetadataStats', () => {
  beforeEach(reset)

  it('counts total, stale, and failed entries', async () => {
    await setMetadata('channel', 'fresh', {})
    await setMetadata('channel', 'stale', {})
    await setMetadata('channel', 'broken', {})
    await ageEntry('channel', 'stale', METADATA_TTL_MS.channel + 60_000)
    await ageEntry('channel', 'broken', METADATA_TTL_MS.channel + 60_000)
    for (let i = 0; i < MAX_FAILURES; i++) await recordMetadataFailure('channel', 'broken')

    expect(await getMetadataStats()).toEqual({ total: 3, stale: 2, failed: 1 })
  })
})
