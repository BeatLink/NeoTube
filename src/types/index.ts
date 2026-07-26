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
}

export interface ChannelVideoCache {
  _id: string
  _rev?: string
  type: 'channelcache'
  channelId: string
  videos: CachedVideo[]
  fetchedAt: string
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
