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

export interface Comment {
  commentId: string
  author: string
  authorAvatar: string
  authorIsOwner: boolean
  text: string
  /** Pre-formatted by YouTube, e.g. "272K". */
  likeCount: string
  publishedText: string
  replyCount: string
  /** Whether a replies thread can be fetched for this comment. */
  hasReplies: boolean
  isPinned: boolean
}

export interface CommentThread {
  comments: Comment[]
  /** e.g. "2,445,333 Comments" */
  totalText: string
}

export interface VideoInfo {
  videoId: string
  title: string
  channelId: string
  channelName: string
  channelAvatar?: string
  description: string
  duration: number      // seconds
  thumbnail: string
  publishedAt: string
  viewCount?: number
  likeCount?: number
  /** "Oct 25, 2009" and "16 years ago", as YouTube formats them. */
  publishedText?: string
  publishedRelative?: string
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

/** A channel returned by search. */
export interface ChannelSearchResult {
  channelId: string
  name: string
  avatar: string
  /** e.g. "@kurzgesagt" */
  handle?: string
  /** Pre-formatted by YouTube, e.g. "25.4M subscribers". */
  subscriberCountText?: string
  description?: string
}

/** A playlist and its contents. */
export interface PlaylistDetail {
  playlistId: string
  title: string
  description?: string
  author: string
  authorId?: string
  thumbnail: string
  /** Pre-formatted by YouTube, e.g. "27 videos" / "722,549 views". */
  totalItemsText?: string
  viewsText?: string
  videos: SearchResult[]
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
  /** Searches for channels rather than videos. */
  searchChannels?(query: string, limit?: number): Promise<ChannelSearchResult[]>
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
  /** Searches within one channel's full catalogue, not just loaded videos. */
  searchChannelVideos?(channelId: string, query: string, limit?: number): Promise<SearchResult[]>
  /** Top-level comments for a video. */
  getComments?(videoId: string, limit?: number): Promise<CommentThread>
  /** Replies to one comment. Requires getComments() to have run for the video. */
  getCommentReplies?(videoId: string, commentId: string): Promise<Comment[]>
  /** Fetches a playlist and its videos. */
  getPlaylist?(playlistId: string, limit?: number): Promise<PlaylistDetail>
  /** Channels this channel features on its home tab. */
  getFeaturedChannels?(channelId: string, limit?: number): Promise<FeaturedChannel[]>
  /**
   * Returns a DASH manifest for adaptive playback above 360p, or null when the
   * environment can't support it. Optional — backends without adaptive streams
   * simply omit it and the player uses `VideoInfo.streams`.
   */
  getDashManifest?(videoId: string): Promise<string | null>
}
