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

export interface UserSettings {
  _id: 'settings'
  _rev?: string
  type: 'settings'
  theme: 'light' | 'dark' | 'system'
  activePlugin: string
  defaultQuality: '144p' | '360p' | '720p' | '1080p' | 'best'
  privacyMode: boolean
  watchedVideoStyle: 'normal' | 'dim' | 'hide'
}
