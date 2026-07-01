import { describe, it, expect, beforeEach, vi } from 'vitest'
import PouchDB from 'pouchdb'
// @ts-expect-error — no type declaration for pouchdb-adapter-memory
import MemoryAdapter from 'pouchdb-adapter-memory'
import type { UserSettings } from '../types'

PouchDB.plugin(MemoryAdapter)

// Isolate each test with a fresh in-memory db
function makeTestDb() {
  return new PouchDB<UserSettings>(`test-${Math.random()}`, { adapter: 'memory' })
}

const DEFAULT: UserSettings = {
  _id: 'settings',
  type: 'settings',
  theme: 'system',
  defaultQuality: 'best',
  privacyMode: true,
}

async function getSettings(db: PouchDB.Database<UserSettings>): Promise<UserSettings> {
  try {
    return await db.get<UserSettings>('settings')
  } catch {
    const result = await db.put(DEFAULT)
    return { ...DEFAULT, _rev: result.rev }
  }
}

async function saveSettings(db: PouchDB.Database<UserSettings>, patch: Partial<UserSettings>): Promise<void> {
  const current = await getSettings(db)
  await db.put({ ...current, ...patch })
}

describe('settings db', () => {
  let db: PouchDB.Database<UserSettings>

  beforeEach(() => {
    db = makeTestDb()
  })

  it('returns default settings on first read', async () => {
    const settings = await getSettings(db)
    expect(settings.theme).toBe('system')
    expect(settings.privacyMode).toBe(true)
  })

  it('saves and retrieves theme preference', async () => {
    await saveSettings(db, { theme: 'dark' })
    const settings = await getSettings(db)
    expect(settings.theme).toBe('dark')
  })

  it('partial save does not overwrite unrelated fields', async () => {
    await saveSettings(db, { theme: 'dark' })
    await saveSettings(db, { defaultQuality: '720p' })
    const settings = await getSettings(db)
    expect(settings.theme).toBe('dark')
    expect(settings.defaultQuality).toBe('720p')
    expect(settings.privacyMode).toBe(true)
  })

  it('save is idempotent — updates existing doc without conflict', async () => {
    await saveSettings(db, { theme: 'light' })
    await saveSettings(db, { theme: 'dark' })
    const settings = await getSettings(db)
    expect(settings.theme).toBe('dark')
  })
})
