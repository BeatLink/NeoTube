import * as innertube from './innertube'
import type { VideoPlugin, VideoInfo, SearchResult, ChannelInfo, ChannelPlaylist, StreamUrl } from '../types'

interface YtjsRawFormat {
  url?: string
  mime_type?: string
  quality_label?: string
  width?: number
  height?: number
  audio_channels?: number
  bitrate?: number
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
  readonly description = 'Reverse-engineered YouTube client. Runs in the webview — CORS bypassed via Tauri\'s native HTTP stack.'

  async isAvailable(): Promise<boolean> {
    return true
  }

  async getVideoInfo(videoId: string): Promise<VideoInfo> {
    const raw = await innertube.getInfo(videoId)

    const streams: StreamUrl[] = (raw.formats ?? [])
      .map((f: YtjsRawFormat): StreamUrl | null => {
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

  async getDashManifest(videoId: string): Promise<string | null> {
    return innertube.getDashManifest(videoId)
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const results = await innertube.search(query, limit)
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
    const raw = await innertube.getChannelInfo(channelId)
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

  async getChannelVideos(channelId: string, limit = 30): Promise<SearchResult[]> {
    const items = await innertube.getChannelVideos(channelId, limit)
    return items.map(v => ({
      videoId: v.video_id,
      title: v.title,
      channelId,
      channelName: '',
      thumbnail: v.thumbnail,
      duration: v.duration,
      viewCount: undefined,
    }))
  }

  async getChannelPlaylists(channelId: string, limit = 20): Promise<ChannelPlaylist[]> {
    const items = await innertube.getChannelPlaylists(channelId, limit)
    return items.map(p => {
      const countText = p.video_count_text ?? ''
      const countNum = parseInt(countText.replace(/\D/g, ''), 10)
      return {
        playlistId: p.playlist_id,
        title: p.title,
        thumbnail: p.thumbnail,
        videoCount: isNaN(countNum) ? undefined : countNum,
      }
    })
  }
}
