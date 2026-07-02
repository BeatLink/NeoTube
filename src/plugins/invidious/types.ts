// Invidious REST API response shapes (only fields we use)

export interface InvThumbnail {
  quality: string
  url: string
  width?: number
  height?: number
}

export interface InvAdaptiveFormat {
  url: string
  type: string            // "video/mp4; codecs=\"avc1.640028\""
  bitrate?: number | string
  qualityLabel?: string   // "1080p" for video; absent for audio-only
  resolution?: string     // "1080p", "1920x1080"
  fps?: number
  audioQuality?: string   // "AUDIO_QUALITY_MEDIUM" for audio streams
  audioSampleRate?: number
  audioChannels?: number
  container?: string      // "mp4", "webm"
}

export interface InvFormatStream {
  url: string
  type: string            // "video/mp4"
  quality: string         // "hd720", "medium"
  qualityLabel: string    // "720p", "360p"
  container?: string
  audioQuality?: string
}

export interface InvVideoResponse {
  videoId: string
  title: string
  description: string
  published: number
  viewCount: number
  author: string
  authorId: string
  lengthSeconds: number
  videoThumbnails: InvThumbnail[]
  adaptiveFormats: InvAdaptiveFormat[]
  formatStreams: InvFormatStream[]
}

export interface InvSearchVideo {
  type: 'video'
  videoId: string
  title: string
  author: string
  authorId: string
  videoThumbnails: InvThumbnail[]
  lengthSeconds: number
  viewCount: number
  published: number
}

export interface InvChannelResponse {
  author: string
  authorId: string
  authorThumbnails: Array<{ url: string; width: number; height: number }>
  description: string
  subCount?: number
}

export interface InvChannelVideosResponse {
  videos: InvSearchVideo[]
}

export interface InvChannelPlaylist {
  playlistId: string
  title: string
  playlistThumbnail: string
  videoCount?: number
}

export interface InvChannelPlaylistsResponse {
  playlists: InvChannelPlaylist[]
}

// instances.json shape — api/cors are 1/null in practice, not true/false
export interface InvInstanceMeta {
  flag?: string
  region?: string
  cors?: boolean | number | null
  api?: boolean | number | null
  type?: string
  uri: string
  monitor?: {
    uptime?: number
    down?: boolean
  }
}
