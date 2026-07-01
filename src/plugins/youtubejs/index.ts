import type { VideoPlugin, VideoInfo, SearchResult, ChannelInfo, StreamUrl } from '../types'

interface YtjsRawChannelInfo {
  channel_id: string
  name: string
  avatar: string
  description: string
  subscriber_count_text?: string
}

declare global {
  interface Window {
    ytjs?: {
      getInfo(videoId: string): Promise<YtjsRawInfo>
      search(query: string, limit?: number): Promise<YtjsRawResult[]>
      getChannelInfo(channelId: string): Promise<YtjsRawChannelInfo>
    }
  }
}

interface YtjsRawFormat {
  url?: string
  mime_type?: string
  quality_label?: string
  width?: number
  height?: number
  audio_channels?: number
  bitrate?: number
}

interface YtjsRawInfo {
  id?: string
  title?: string
  channel_id?: string
  channel_name?: string
  duration?: number
  view_count?: number
  short_description?: string
  thumbnail?: string
  formats: YtjsRawFormat[]
}

interface YtjsRawResult {
  video_id?: string
  title?: string
  channel_name?: string
  channel_id?: string
  thumbnail?: string
  length_text?: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDuration(text?: string | null): number {
  if (!text) return 0
  const parts = text.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export class YoutubeJsPlugin implements VideoPlugin {
  readonly id = 'youtubejs'
  readonly name = 'youtube.js (Local)'
  readonly description = 'Reverse-engineered YouTube client. Requires Electron — runs in the main process to bypass CORS.'

  async isAvailable(): Promise<boolean> {
    return !!window.ytjs
  }

  async getVideoInfo(videoId: string): Promise<VideoInfo> {
    if (!window.ytjs) throw new Error('youtube.js IPC bridge not available')
    const raw = await window.ytjs.getInfo(videoId)

    const streams: StreamUrl[] = (raw.formats ?? [])
      .map((f): StreamUrl | null => {
        if (!f.url) return null
        const mime = f.mime_type ?? ''
        const ext = mime.split('/')[1]?.split(';')[0] ?? 'mp4'
        const hasVideo = mime.startsWith('video/')
        const hasAudio = !!(f.audio_channels) || mime.startsWith('audio/')
        const quality = f.quality_label ?? (hasAudio && !hasVideo ? 'audio only' : 'unknown')
        return { url: f.url, quality, format: ext, width: f.width, height: f.height, hasVideo, hasAudio }
      })
      .filter((s): s is StreamUrl => s !== null)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))

    return {
      videoId: raw.id ?? videoId,
      title: raw.title ?? '',
      channelId: raw.channel_id ?? '',
      channelName: raw.channel_name ?? '',
      description: raw.short_description ?? '',
      duration: raw.duration ?? 0,
      thumbnail: raw.thumbnail ?? '',
      publishedAt: '',
      viewCount: raw.view_count,
      streams,
    }
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    if (!window.ytjs) throw new Error('youtube.js IPC bridge not available')
    const results = await window.ytjs.search(query, limit)
    return results.map(v => ({
      videoId: v.video_id ?? '',
      title: v.title ?? '',
      channelId: v.channel_id ?? '',
      channelName: v.channel_name ?? '',
      thumbnail: v.thumbnail ?? '',
      duration: parseDuration(v.length_text),
      viewCount: undefined,
    }))
  }

  async getChannelInfo(channelId: string): Promise<ChannelInfo> {
    if (!window.ytjs) throw new Error('youtube.js IPC bridge not available')
    const raw = await window.ytjs.getChannelInfo(channelId)
    // subscriber_count_text looks like "1.2M subscribers" or "1,234,567 subscribers"
    let subscriberCount: number | undefined
    if (raw.subscriber_count_text) {
      const num = parseFloat(raw.subscriber_count_text.replace(/,/g, ''))
      if (!isNaN(num)) {
        const lower = raw.subscriber_count_text.toLowerCase()
        if (lower.includes('k')) subscriberCount = Math.round(num * 1_000)
        else if (lower.includes('m')) subscriberCount = Math.round(num * 1_000_000)
        else if (lower.includes('b')) subscriberCount = Math.round(num * 1_000_000_000)
        else subscriberCount = Math.round(num)
      }
    }
    return {
      channelId: raw.channel_id ?? channelId,
      name: raw.name,
      avatar: raw.avatar,
      description: raw.description,
      subscriberCount,
    }
  }
}
