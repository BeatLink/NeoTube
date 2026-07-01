// Shapes of the JSON that yt-dlp --dump-json emits.
// Only the fields we actually use are typed; the rest are unknown.

export interface YtdlpFormat {
  format_id: string
  url: string
  ext: string
  width?: number
  height?: number
  tbr?: number        // total bitrate kbps
  vcodec?: string     // "none" means audio-only
  acodec?: string     // "none" means video-only
  format_note?: string
}

export interface YtdlpThumbnail {
  url: string
  width?: number
  height?: number
  id: string
}

export interface YtdlpRawInfo {
  id: string
  title: string
  uploader?: string
  uploader_id?: string
  channel?: string
  channel_id?: string
  duration?: number
  view_count?: number
  description?: string
  upload_date?: string   // "YYYYMMDD"
  thumbnails?: YtdlpThumbnail[]
  thumbnail?: string
  formats?: YtdlpFormat[]
  // Flat-playlist / search result fields
  ie_key?: string
  url?: string
}
