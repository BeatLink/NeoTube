// Background metadata refresher.
//
// Wakes on an interval, takes the most-stale cache entries, and renews a small
// batch. Two rules keep it from getting in the way:
//
//   1. Small batches with a pause between requests, so it never saturates the
//      network that user-initiated fetches need.
//   2. Never more than one pass in flight — a slow pass delays the next tick
//      rather than overlapping with it.
//
// Backfilling uncached entries is deliberately separate and slower: a large
// history can take many sessions to warm, and it resumes wherever it left off.

import {
  getStaleMetadata,
  getUncachedIds,
  setMetadata,
  recordMetadataFailure,
} from '../db/metadata'
import { getSubscriptions, getHistory } from '../db/index'
import { pluginManager } from '../plugins/manager'
import type { MetadataKind } from '../types'

export interface RefresherOptions {
  /** How often to wake up. */
  intervalMs?: number
  /** Entries renewed per pass. */
  batchSize?: number
  /** Pause between individual requests within a pass. */
  requestSpacingMs?: number
}

const DEFAULTS: Required<RefresherOptions> = {
  intervalMs: 5 * 60 * 1000,
  batchSize: 10,
  requestSpacingMs: 1_000,
}

const sleep = (ms: number) => new Promise<void>(resolve => setTimeout(resolve, ms))

async function fetchFor(kind: MetadataKind, refId: string): Promise<unknown> {
  const plugin = pluginManager.getActive()
  switch (kind) {
    case 'channel':
      return plugin.getChannelInfo(refId)
    case 'playlist':
      // No dedicated lookup yet; playlists are refreshed with their channel.
      throw new Error('playlist refresh not supported')
    case 'video':
      return plugin.getVideoInfo(refId)
  }
}

/** Renews one batch of stale entries. Returns how many succeeded. */
export async function refreshStaleOnce(options: RefresherOptions = {}): Promise<number> {
  const { batchSize, requestSpacingMs } = { ...DEFAULTS, ...options }
  const stale = await getStaleMetadata(batchSize)

  let refreshed = 0
  for (const [i, entry] of stale.entries()) {
    if (i > 0) await sleep(requestSpacingMs)
    try {
      await setMetadata(entry.kind, entry.refId, await fetchFor(entry.kind, entry.refId))
      refreshed++
    } catch {
      await recordMetadataFailure(entry.kind, entry.refId)
    }
  }
  return refreshed
}

/**
 * Caches metadata for subscriptions and watch history that has never been
 * fetched. Runs a single small batch per call so a large history fills in
 * gradually instead of blocking startup.
 */
export async function backfillOnce(options: RefresherOptions = {}): Promise<number> {
  const { batchSize, requestSpacingMs } = { ...DEFAULTS, ...options }

  const subs = await getSubscriptions().catch(() => [])
  let pending: Array<{ kind: MetadataKind; refId: string }> = (
    await getUncachedIds('channel', subs.map(s => s.channelId))
  ).map(refId => ({ kind: 'channel' as const, refId }))

  // Channels first — they drive the feed. Only reach for history once every
  // subscription is cached.
  if (pending.length === 0) {
    const history = await getHistory().catch(() => [])
    pending = (await getUncachedIds('video', history.map(h => h.videoId)))
      .map(refId => ({ kind: 'video' as const, refId }))
  }

  let cached = 0
  for (const [i, entry] of pending.slice(0, batchSize).entries()) {
    if (i > 0) await sleep(requestSpacingMs)
    try {
      await setMetadata(entry.kind, entry.refId, await fetchFor(entry.kind, entry.refId))
      cached++
    } catch {
      await recordMetadataFailure(entry.kind, entry.refId)
    }
  }
  return cached
}

let timer: ReturnType<typeof setInterval> | null = null
let running = false

/**
 * Starts the periodic refresh loop. Safe to call more than once; subsequent
 * calls are ignored while a loop is already active.
 */
export function startRefresher(options: RefresherOptions = {}): void {
  if (timer) return
  const { intervalMs } = { ...DEFAULTS, ...options }

  const tick = async () => {
    // Skip this tick rather than piling passes on top of each other.
    if (running) return
    running = true
    try {
      const refreshed = await refreshStaleOnce(options)
      // Only backfill when nothing was stale, so refreshing what the user can
      // already see always wins over warming what they haven't opened.
      if (refreshed === 0) await backfillOnce(options)
    } catch {
      // A failed pass is not worth surfacing; the next tick retries.
    } finally {
      running = false
    }
  }

  timer = setInterval(() => { void tick() }, intervalMs)
  // Delay the first pass so it doesn't compete with the initial page load.
  setTimeout(() => { void tick() }, 30_000)
}

export function stopRefresher(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}

/** Exposed for tests. */
export function isRefresherRunning(): boolean {
  return timer !== null
}
