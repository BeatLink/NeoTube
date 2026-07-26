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
  /**
   * Display strings as YouTube returns them, e.g. "1.4M views" and "2 weeks
   * ago". Preferred over `viewCount`/`publishedAt` for rendering: the listing
   * APIs only ever supply this pre-formatted text, and parsing it back into a
   * number or timestamp would lose precision without gaining anything.
   */
  viewCountText?: string
  publishedText?: string
}

export interface ChannelInfo {
  channelId: string
  name: string
  avatar: string
  /** Wide header image, if the channel has one. */
  banner?: string
  description?: string
  subscriberCount?: number
  /**
   * Details-panel values, pre-formatted by YouTube — e.g. "Joined Feb 3, 2011",
   * "119,549,338 views", "35 videos".
   */
  joinedText?: string
  totalViewsText?: string
  videoCountText?: string
  country?: string
  tags?: string[]
  /** Whether the channel publishes a playlists tab. */
  hasPlaylists?: boolean
}

/** A channel featured by another channel. */
export interface FeaturedChannel {
  channelId: string
  name: string
  avatar: string
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
  /**
   * Fetches a channel's uploads. `limit` may be `Infinity` to request every
   * video; `onPage` is called with the accumulated list after each page so
   * callers can render progressively.
   */
  getChannelVideos?(
    channelId: string,
    limit?: number,
    onPage?: (videos: SearchResult[]) => void,
    sort?: 'Latest' | 'Popular' | 'Oldest',
  ): Promise<SearchResult[]>
  getChannelPlaylists?(channelId: string, limit?: number): Promise<ChannelPlaylist[]>
  /** Channels this channel features on its home tab. */
  getFeaturedChannels?(channelId: string, limit?: number): Promise<FeaturedChannel[]>
  /**
   * Returns a DASH manifest for adaptive playback above 360p, or null when the
   * environment can't support it. Optional — backends without adaptive streams
   * simply omit it and the player uses `VideoInfo.streams`.
   */
  getDashManifest?(videoId: string): Promise<string | null>
}
