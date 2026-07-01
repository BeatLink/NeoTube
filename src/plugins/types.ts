// ─── Domain types returned by all plugins ────────────────────────────────────

export interface StreamUrl {
  url: string
  quality: string       // e.g. "1080p", "720p", "audio only"
  format: string        // e.g. "mp4", "webm", "m4a"
  width?: number
  height?: number
  bitrate?: number      // kbps
  hasVideo: boolean
  hasAudio: boolean
}

export interface VideoInfo {
  videoId: string
  title: string
  channelId: string
  channelName: string
  description: string
  duration: number      // seconds
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
  publishedAt?: string
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

// ─── Plugin interface ─────────────────────────────────────────────────────────

export interface VideoPlugin {
  /** Unique identifier, used to look up the plugin in the manager */
  readonly id: string
  /** Human-readable name shown in settings */
  readonly name: string
  /** Short description shown in settings */
  readonly description: string

  /** Returns true if this plugin can be used in the current environment */
  isAvailable(): Promise<boolean>

  getVideoInfo(videoId: string): Promise<VideoInfo>
  search(query: string, limit?: number): Promise<SearchResult[]>
  getChannelInfo(channelId: string): Promise<ChannelInfo>
  getChannelVideos?(channelId: string, limit?: number): Promise<SearchResult[]>
  getChannelPlaylists?(channelId: string, limit?: number): Promise<ChannelPlaylist[]>
}
