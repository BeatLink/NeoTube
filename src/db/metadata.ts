// Generic read-through metadata cache.
//
// Pages ask for metadata by kind + id; a fresh copy is served straight from
// PouchDB, and only a missing or expired entry causes a network fetch. The
// background refresher (src/services/refresher.ts) walks the same documents and
// renews whatever has gone stale.

import { db } from './client'
import type { MetadataCache, MetadataKind } from '../types'

const PREFIX = 'metadata-'

function metadataId(kind: MetadataKind, refId: string): string {
  return `${PREFIX}${kind}-${refId}`
}

/** Default lifetime per kind. Videos change least, channel listings most. */
export const METADATA_TTL_MS: Record<MetadataKind, number> = {
  channel: 30 * 60 * 1000,
  playlist: 6 * 60 * 60 * 1000,
  video: 24 * 60 * 60 * 1000,
}

/** Give up on an entry after this many consecutive failures. */
export const MAX_FAILURES = 5

/**
 * Shape version of cached payloads. Bump this whenever a cached type gains or
 * changes fields — entries written by an older version are treated as stale, so
 * new fields get populated instead of serving documents that silently lack them.
 *
 * 2: ChannelInfo gained banner, joined/views/video-count text, country, tags,
 *    and the full description from getAbout().
 */
export const METADATA_VERSION = 2

export function isFresh(
  doc: Pick<MetadataCache, 'fetchedAt' | 'version'>,
  ttlMs: number,
): boolean {
  // A payload written before the current shape is missing fields the UI now
  // expects, so it must be refetched regardless of age.
  if ((doc.version ?? 1) !== METADATA_VERSION) return false
  const fetchedAt = Date.parse(doc.fetchedAt)
  if (!Number.isFinite(fetchedAt)) return false
  const age = Date.now() - fetchedAt
  // A timestamp in the future means a clock change; treat it as stale rather
  // than trusting it and never refreshing again.
  return age >= 0 && age < ttlMs
}

export async function getMetadata<T>(
  kind: MetadataKind,
  refId: string,
): Promise<MetadataCache<T> | null> {
  try {
    return await db().get<MetadataCache<T>>(metadataId(kind, refId))
  } catch {
    return null
  }
}

export async function setMetadata<T>(
  kind: MetadataKind,
  refId: string,
  data: T,
): Promise<void> {
  const id = metadataId(kind, refId)
  let existing: MetadataCache<T> | undefined
  try { existing = await db().get<MetadataCache<T>>(id) } catch { /* new entry */ }

  await db().put<MetadataCache<T>>({
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'metadata',
    kind,
    refId,
    data,
    fetchedAt: new Date().toISOString(),
    version: METADATA_VERSION,
    // A success clears any prior failure streak.
    failedAt: undefined,
    failures: 0,
  })
}

/** Records a failed refresh so the poller can back off. */
export async function recordMetadataFailure(
  kind: MetadataKind,
  refId: string,
): Promise<void> {
  const id = metadataId(kind, refId)
  try {
    const existing = await db().get<MetadataCache>(id)
    await db().put<MetadataCache>({
      ...existing,
      failedAt: new Date().toISOString(),
      failures: (existing.failures ?? 0) + 1,
    })
  } catch {
    // Nothing cached yet — a first fetch that fails simply isn't stored.
  }
}

/**
 * Reads through the cache: returns the stored copy when fresh, otherwise
 * fetches, stores, and returns the new value.
 *
 * If the fetch fails but a stale copy exists, the stale copy is returned —
 * showing slightly old data beats showing an error.
 */
export async function getOrFetchMetadata<T>(
  kind: MetadataKind,
  refId: string,
  fetcher: () => Promise<T>,
  ttlMs: number = METADATA_TTL_MS[kind],
): Promise<T> {
  const cached = await getMetadata<T>(kind, refId)
  if (cached && isFresh(cached, ttlMs)) return cached.data

  try {
    const fresh = await fetcher()
    await setMetadata(kind, refId, fresh)
    return fresh
  } catch (err) {
    await recordMetadataFailure(kind, refId)
    if (cached) return cached.data
    throw err
  }
}

export interface StaleEntry {
  kind: MetadataKind
  refId: string
  fetchedAt: string
}

/**
 * Returns cached entries past their TTL, oldest first, so the refresher always
 * works on whatever has been neglected longest.
 *
 * Entries that have failed {@link MAX_FAILURES} times in a row are skipped —
 * they are usually deleted or private videos, and retrying them forever would
 * starve the queue.
 */
export async function getStaleMetadata(
  limit: number,
  ttls: Record<MetadataKind, number> = METADATA_TTL_MS,
): Promise<StaleEntry[]> {
  const result = await db().allDocs<MetadataCache>({
    include_docs: true,
    startkey: PREFIX,
    endkey: `${PREFIX}￰`,
  })

  return result.rows
    .flatMap(row => (row.doc ? [row.doc] : []))
    .filter(doc => (doc.failures ?? 0) < MAX_FAILURES)
    .filter(doc => !isFresh(doc, ttls[doc.kind] ?? METADATA_TTL_MS.video))
    .sort((a, b) => Date.parse(a.fetchedAt) - Date.parse(b.fetchedAt))
    .slice(0, limit)
    .map(doc => ({ kind: doc.kind, refId: doc.refId, fetchedAt: doc.fetchedAt }))
}

/** Ids of the given kind that have no cache entry at all. */
export async function getUncachedIds(
  kind: MetadataKind,
  refIds: string[],
): Promise<string[]> {
  const result = await db().allDocs({
    startkey: `${PREFIX}${kind}-`,
    endkey: `${PREFIX}${kind}-￰`,
  })
  const cached = new Set(
    result.rows.map(row => (row.id as string).slice(`${PREFIX}${kind}-`.length)),
  )
  return refIds.filter(id => !cached.has(id))
}

export interface MetadataStats {
  total: number
  stale: number
  failed: number
}

export async function getMetadataStats(): Promise<MetadataStats> {
  const result = await db().allDocs<MetadataCache>({
    include_docs: true,
    startkey: PREFIX,
    endkey: `${PREFIX}￰`,
  })
  const docs = result.rows.flatMap(row => (row.doc ? [row.doc] : []))

  return {
    total: docs.length,
    stale: docs.filter(d => !isFresh(d, METADATA_TTL_MS[d.kind] ?? METADATA_TTL_MS.video)).length,
    failed: docs.filter(d => (d.failures ?? 0) >= MAX_FAILURES).length,
  }
}
