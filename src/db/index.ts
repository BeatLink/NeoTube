// pouchdb-browser uses IndexedDB — the correct adapter for all browser/Electron targets.
// Tests import pouchdb directly with the memory adapter (see src/test/db.test.ts).
import PouchDB from 'pouchdb-browser'
import type { UserSettings } from '../types'

// Lazy singleton — deferred until first use so tests that mock this module
// never trigger the IndexedDB constructor in jsdom.
let _db: PouchDB.Database<UserSettings> | null = null
function db(): PouchDB.Database<UserSettings> {
  if (!_db) _db = new PouchDB<UserSettings>('neotube')
  return _db
}

const DEFAULT_SETTINGS: UserSettings = {
  _id: 'settings',
  type: 'settings',
  theme: 'system',
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

export function syncWith(remoteUrl: string) {
  return db().sync(remoteUrl, { live: true, retry: true })
}
