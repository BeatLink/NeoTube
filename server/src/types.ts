// ─── YouTube domain types ──────────────────────────────────────────────────────
// These mirror src/plugins/types.ts in the frontend.

export interface StreamUrl {
  url: string
  quality: string
  format: string
  width?: number
  height?: number
  hasVideo: boolean
  hasAudio: boolean
}

export interface VideoInfo {
  videoId: string
  title: string
  channelId: string
  channelName: string
  description: string
  duration: number
  thumbnail: string
  publishedAt: string
  viewCount?: number
  streams: StreamUrl[]
}

export interface SearchResult {
  videoId: string
  title: string
  channelId: string
  channelName: string
  thumbnail: string
  duration: number
  viewCount?: number
}

export interface ChannelInfo {
  channelId: string
  name: string
  avatar: string
  description?: string
  subscriberCount?: number
}

export interface ChannelPlaylist {
  playlistId: string
  title: string
  thumbnail: string
  videoCount?: number
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

// ─── Database document types ───────────────────────────────────────────────────

export interface UserSettings {
  _id: 'settings'
  _rev?: string
  type: 'settings'
  theme: 'light' | 'dark' | 'system'
  activeBackend: 'youtubejs' | 'ytdlp'
  defaultQuality: '144p' | '360p' | '720p' | '1080p' | 'best'
  privacyMode: boolean
  watchedVideoStyle: 'normal' | 'dim' | 'hide'
  feedSortMode: 'channel' | 'date'
  feedHideWatched: boolean
  channelsHideWatched: boolean
  channelPageHideWatched: boolean
  ytCookie?: string
  apiKey?: string
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
  watchedAt: string
  watchCount: number
}

export interface ChannelVideoCache {
  _id: string
  _rev?: string
  type: 'channelcache'
  channelId: string
  videos: CachedVideo[]
  fetchedAt: string
}
