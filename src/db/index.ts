// pouchdb-browser uses IndexedDB — the correct adapter for all browser/Electron targets.
// Tests import pouchdb directly with the memory adapter (see src/test/db.test.ts).
import PouchDB from 'pouchdb-browser'
import type { UserSettings, Subscription } from '../types'

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

  const doc: Subscription = {
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'subscription',
    channelId,
    channelName,
    ...(avatar ? { avatar } : {}),
    subscribedAt: existing?.subscribedAt ?? new Date().toISOString(),
  }
  await db().put(doc)
}

export async function unsubscribe(channelId: string): Promise<void> {
  try {
    const doc = await db().get(subId(channelId))
    await db().remove(doc)
  } catch {
    // Already gone — treat as success
  }
}

// ─── P2P Sync ─────────────────────────────────────────────────────────────────

export function syncWith(remoteUrl: string) {
  return db().sync(remoteUrl, { live: true, retry: true })
}
