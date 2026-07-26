// Playlist storage.
//
// Two document types share this module because they are listed together:
//   `playlist-<id>`     personal, fully editable
//   `playlistsub-<id>`  a snapshot of a YouTube playlist, read-only
//
// Both embed their videos rather than referencing them, so a personal playlist
// survives a video being pulled from YouTube and a subscribed snapshot renders
// without a network round trip.

import { db } from './client'
import type {
  AnyPlaylist, PersonalPlaylist, SubscribedPlaylist, PlaylistVideo,
} from '../types'

const PERSONAL_PREFIX = 'playlist-'
const SUBSCRIBED_PREFIX = 'playlistsub-'

function personalId(playlistId: string): string { return `${PERSONAL_PREFIX}${playlistId}` }
function subscribedId(playlistId: string): string { return `${SUBSCRIBED_PREFIX}${playlistId}` }

function emitPlaylistsChanged() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('playlists-changed'))
  }
}

/** Sufficiently unique for a local-only id, and readable in the URL. */
function newPlaylistId(): string {
  return `p${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

// ─── Personal playlists ───────────────────────────────────────────────────────

export async function createPlaylist(
  title: string,
  description?: string,
): Promise<PersonalPlaylist> {
  const now = new Date().toISOString()
  const playlistId = newPlaylistId()
  const doc: PersonalPlaylist = {
    _id: personalId(playlistId),
    type: 'playlist',
    playlistId,
    title,
    description,
    videos: [],
    createdAt: now,
    updatedAt: now,
  }

  const result = await db().put(doc)
  emitPlaylistsChanged()
  return { ...doc, _rev: result.rev }
}

export async function getPlaylist(playlistId: string): Promise<PersonalPlaylist | null> {
  try {
    return await db().get<PersonalPlaylist>(personalId(playlistId))
  } catch {
    return null
  }
}

export async function getPlaylists(): Promise<PersonalPlaylist[]> {
  const result = await db().allDocs<PersonalPlaylist>({
    include_docs: true,
    startkey: PERSONAL_PREFIX,
    // A plain `-` upper bound would also match `playlistsub-`, so stop before it.
    endkey: `${PERSONAL_PREFIX}￰`,
  })
  return result.rows
    .flatMap(row => (row.doc ? [row.doc] : []))
    .filter(doc => doc.type === 'playlist')
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function renamePlaylist(
  playlistId: string,
  title: string,
  description?: string,
): Promise<void> {
  const doc = await getPlaylist(playlistId)
  if (!doc) return
  await db().put<PersonalPlaylist>({
    ...doc,
    title,
    description: description ?? doc.description,
    updatedAt: new Date().toISOString(),
  })
  emitPlaylistsChanged()
}

export async function deletePlaylist(playlistId: string): Promise<void> {
  const doc = await getPlaylist(playlistId)
  if (!doc?._rev) return
  await db().remove(doc._id, doc._rev)
  emitPlaylistsChanged()
}

/** Appends a video, ignoring duplicates. */
export async function addToPlaylist(
  playlistId: string,
  video: PlaylistVideo,
): Promise<void> {
  const doc = await getPlaylist(playlistId)
  if (!doc) return
  if (doc.videos.some(v => v.videoId === video.videoId)) return

  await db().put<PersonalPlaylist>({
    ...doc,
    videos: [...doc.videos, video],
    updatedAt: new Date().toISOString(),
  })
  emitPlaylistsChanged()
}

export async function removeFromPlaylist(
  playlistId: string,
  videoId: string,
): Promise<void> {
  const doc = await getPlaylist(playlistId)
  if (!doc) return
  await db().put<PersonalPlaylist>({
    ...doc,
    videos: doc.videos.filter(v => v.videoId !== videoId),
    updatedAt: new Date().toISOString(),
  })
  emitPlaylistsChanged()
}

/**
 * Moves a video to a new index. Out-of-range positions are clamped rather than
 * rejected, so a drag past either end behaves sensibly.
 */
export async function reorderPlaylist(
  playlistId: string,
  videoId: string,
  toIndex: number,
): Promise<void> {
  const doc = await getPlaylist(playlistId)
  if (!doc) return

  const from = doc.videos.findIndex(v => v.videoId === videoId)
  if (from === -1) return

  const target = Math.max(0, Math.min(toIndex, doc.videos.length - 1))
  if (from === target) return

  const videos = [...doc.videos]
  const [moved] = videos.splice(from, 1)
  videos.splice(target, 0, moved)

  await db().put<PersonalPlaylist>({
    ...doc,
    videos,
    updatedAt: new Date().toISOString(),
  })
  emitPlaylistsChanged()
}

// ─── Subscribed playlists ─────────────────────────────────────────────────────

export async function subscribeToPlaylist(
  playlist: Omit<SubscribedPlaylist, '_id' | '_rev' | 'type' | 'subscribedAt' | 'fetchedAt'>,
): Promise<void> {
  const id = subscribedId(playlist.playlistId)
  let existing: SubscribedPlaylist | undefined
  try { existing = await db().get<SubscribedPlaylist>(id) } catch { /* new */ }

  const now = new Date().toISOString()
  await db().put<SubscribedPlaylist>({
    ...playlist,
    _id: id,
    ...(existing?._rev ? { _rev: existing._rev } : {}),
    type: 'playlist-sub',
    // Re-subscribing refreshes the snapshot but keeps the original date.
    subscribedAt: existing?.subscribedAt ?? now,
    fetchedAt: now,
  })
  emitPlaylistsChanged()
}

export async function unsubscribeFromPlaylist(playlistId: string): Promise<void> {
  try {
    const doc = await db().get(subscribedId(playlistId))
    await db().remove(doc)
    emitPlaylistsChanged()
  } catch { /* already gone */ }
}

export async function getSubscribedPlaylist(
  playlistId: string,
): Promise<SubscribedPlaylist | null> {
  try {
    return await db().get<SubscribedPlaylist>(subscribedId(playlistId))
  } catch {
    return null
  }
}

export async function getSubscribedPlaylists(): Promise<SubscribedPlaylist[]> {
  const result = await db().allDocs<SubscribedPlaylist>({
    include_docs: true,
    startkey: SUBSCRIBED_PREFIX,
    endkey: `${SUBSCRIBED_PREFIX}￰`,
  })
  return result.rows
    .flatMap(row => (row.doc ? [row.doc] : []))
    .sort((a, b) => a.title.localeCompare(b.title))
}

export async function isPlaylistSubscribed(playlistId: string): Promise<boolean> {
  return (await getSubscribedPlaylist(playlistId)) !== null
}

/** Replaces a snapshot's videos with a freshly fetched list. */
export async function refreshSubscribedPlaylist(
  playlistId: string,
  videos: PlaylistVideo[],
): Promise<void> {
  const doc = await getSubscribedPlaylist(playlistId)
  if (!doc) return
  await db().put<SubscribedPlaylist>({
    ...doc,
    videos,
    fetchedAt: new Date().toISOString(),
  })
  emitPlaylistsChanged()
}

/** Both kinds, for the playlists index. */
export async function getAllPlaylists(): Promise<AnyPlaylist[]> {
  const [personal, subscribed] = await Promise.all([
    getPlaylists(),
    getSubscribedPlaylists(),
  ])
  return [...personal, ...subscribed]
}
