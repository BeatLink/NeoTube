export interface Video {
  _id: string
  _rev?: string
  type: 'video'
  videoId: string
  title: string
  channelId: string
  channelName: string
  thumbnail: string
  duration: number
  publishedAt: string
  viewCount?: number
  description?: string
}

export interface Channel {
  _id: string
  _rev?: string
  type: 'channel'
  channelId: string
  name: string
  avatar: string
  subscriberCount?: number
  description?: string
}

export interface Subscription {
  _id: string
  _rev?: string
  type: 'subscription'
  channelId: string
  channelName: string
  avatar?: string
  subscribedAt: string
}

// ─── Playlists ────────────────────────────────────────────────────────────────

/**
 * A video stored in a playlist.
 *
 * Deliberately self-contained rather than a reference: a personal playlist must
 * keep working when a video is pulled from YouTube, and a subscribed snapshot
 * must render without a network round trip.
 */
export interface PlaylistVideo {
  videoId: string
  title: string
  channelId: string
  channelName: string
  thumbnail: string
  duration: number
  viewCountText?: string
  publishedText?: string
}

/**
 * A playlist the user created. Videos can be added, removed, and reordered —
 * `videos` order is the playlist order.
 */
export interface PersonalPlaylist {
  _id: string
  _rev?: string
  type: 'playlist'
  playlistId: string
  title: string
  description?: string
  videos: PlaylistVideo[]
  createdAt: string
  updatedAt: string
}

/**
 * A YouTube playlist the user follows. Read-only: the contents belong to its
 * author, so the local copy is a snapshot refreshed on demand.
 */
export interface SubscribedPlaylist {
  _id: string
  _rev?: string
  type: 'playlist-sub'
  playlistId: string
  title: string
  author: string
  authorId?: string
  thumbnail: string
  description?: string
  videos: PlaylistVideo[]
  subscribedAt: string
  /** When the snapshot was last pulled, so staleness can be surfaced. */
  fetchedAt: string
}

export type AnyPlaylist = PersonalPlaylist | SubscribedPlaylist

export function isPersonalPlaylist(p: AnyPlaylist): p is PersonalPlaylist {
  return p.type === 'playlist'
}

export interface WatchHistoryEntry {
  _id: string
  _rev?: string
  type: 'history'
  videoId: string
  title: string
  channelId: string
  channelName: string
  thumbnail: string
  duration: number
  watchedAt: string   // ISO — most recent watch
  watchCount: number
}

export interface CachedVideo {
  videoId: string
  title: string
  channelId: string
  channelName: string
  thumbnail: string
  duration: number
  viewCount?: number
  publishedAt?: string
  /** Display text from YouTube, e.g. "1.4M views" / "2 weeks ago". */
  viewCountText?: string
  publishedText?: string
}

export interface ChannelVideoCache {
  _id: string
  _rev?: string
  type: 'channelcache'
  channelId: string
  videos: CachedVideo[]
  fetchedAt: string
}

// ─── Metadata cache ───────────────────────────────────────────────────────────

/** What a cached metadata document describes. */
export type MetadataKind = 'channel' | 'playlist' | 'video'

/**
 * A cached blob of metadata, keyed `metadata-<kind>-<id>`.
 *
 * `fetchedAt` drives staleness for both read-through lookups and the background
 * refresher; `failedAt`/`failures` let the poller back off from entries that
 * keep erroring instead of retrying them forever.
 */
export interface MetadataCache<T = unknown> {
  _id: string
  _rev?: string
  type: 'metadata'
  kind: MetadataKind
  refId: string
  data: T
  fetchedAt: string
  /** Shape version this was written with; see METADATA_VERSION. */
  version?: number
  failedAt?: string
  failures?: number
}

/** Pages that can be chosen as the launch destination. */
export type StartupPage = 'subscriptions' | 'channels' | 'history'

export const STARTUP_PAGES: ReadonlyArray<{ value: StartupPage; label: string }> = [
  { value: 'subscriptions', label: 'Subscriptions' },
  { value: 'channels', label: 'Channels' },
  { value: 'history', label: 'History' },
]

export interface UserSettings {
  _id: 'settings'
  _rev?: string
  type: 'settings'
  theme: 'light' | 'dark' | 'system'
  activePlugin: string
  /** Route rendered on launch, e.g. 'subscriptions'. */
  startupPage: StartupPage
  defaultQuality: '144p' | '360p' | '720p' | '1080p' | 'best'
  privacyMode: boolean
  watchedVideoStyle: 'normal' | 'dim' | 'hide'
  feedSortMode: 'channel' | 'date'
  feedHideWatched: boolean
  channelsHideWatched: boolean
  channelPageHideWatched: boolean
  ytCookie?: string
}
