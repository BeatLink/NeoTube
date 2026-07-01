import PouchDB from 'pouchdb'
import type { UserSettings } from '../types'

export const db = new PouchDB<UserSettings>('neotube')

const DEFAULT_SETTINGS: UserSettings = {
  _id: 'settings',
  type: 'settings',
  theme: 'system',
  defaultQuality: 'best',
  privacyMode: true,
}

export async function getSettings(): Promise<UserSettings> {
  try {
    return await db.get<UserSettings>('settings')
  } catch {
    await db.put(DEFAULT_SETTINGS)
    return DEFAULT_SETTINGS
  }
}

export async function saveSettings(patch: Partial<UserSettings>): Promise<void> {
  const current = await getSettings()
  await db.put({ ...current, ...patch })
}

export function syncWith(remoteUrl: string) {
  return db.sync(remoteUrl, { live: true, retry: true })
}
