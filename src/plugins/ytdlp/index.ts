import type { VideoPlugin, VideoInfo, SearchResult, ChannelInfo, StreamUrl } from '../types'
import type { YtdlpRawInfo, YtdlpFormat } from './types'

interface YtdlpRawChannelInfo {
  channel_id: string
  name: string
  avatar: string
  description: string
}

// Window shape injected by the Electron preload
interface YtdlpBridge {
  getInfo: (videoId: string) => Promise<YtdlpRawInfo>
  search: (query: string, limit: number) => Promise<YtdlpRawInfo[]>
  getChannelInfo: (channelId: string) => Promise<YtdlpRawChannelInfo>
}

declare global {
  interface Window {
    ytdlp?: YtdlpBridge
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseDateStr(yyyymmdd?: string): string {
  if (!yyyymmdd || yyyymmdd.length !== 8) return new Date().toISOString()
  return `${yyyymmdd.slice(0, 4)}-${yyyymmdd.slice(4, 6)}-${yyyymmdd.slice(6, 8)}T00:00:00.000Z`
}

function bestThumbnail(raw: YtdlpRawInfo): string {
  if (raw.thumbnails && raw.thumbnails.length > 0) {
    // Prefer the largest thumbnail
    const sorted = [...raw.thumbnails].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
    return sorted[0].url
  }
  return raw.thumbnail ?? ''
}

function mapStreams(formats: YtdlpFormat[]): StreamUrl[] {
  return formats
    .filter(f => f.url && !f.url.startsWith('manifest'))
    .map(f => {
      const hasVideo = f.vcodec !== 'none' && !!f.vcodec
      const hasAudio = f.acodec !== 'none' && !!f.acodec
      const height = f.height
      const quality = height ? `${height}p` : (hasAudio && !hasVideo ? 'audio only' : f.format_note ?? f.format_id)
      return {
        url: f.url,
        quality,
        format: f.ext,
        width: f.width,
        height: f.height,
        bitrate: f.tbr,
        hasVideo,
        hasAudio,
      }
    })
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
}

function rawToVideoInfo(raw: YtdlpRawInfo): VideoInfo {
  return {
    videoId: raw.id,
    title: raw.title,
    channelId: raw.channel_id ?? raw.uploader_id ?? '',
    channelName: raw.channel ?? raw.uploader ?? '',
    description: raw.description ?? '',
    duration: raw.duration ?? 0,
    thumbnail: bestThumbnail(raw),
    publishedAt: parseDateStr(raw.upload_date),
    viewCount: raw.view_count,
    streams: mapStreams(raw.formats ?? []),
  }
}

function rawToSearchResult(raw: YtdlpRawInfo): SearchResult {
  return {
    videoId: raw.id,
    title: raw.title,
    channelId: raw.channel_id ?? raw.uploader_id ?? '',
    channelName: raw.channel ?? raw.uploader ?? '',
    thumbnail: bestThumbnail(raw),
    duration: raw.duration ?? 0,
    viewCount: raw.view_count,
    publishedAt: raw.upload_date ? parseDateStr(raw.upload_date) : undefined,
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export class YtdlpPlugin implements VideoPlugin {
  readonly id = 'ytdlp'
  readonly name = 'yt-dlp'
  readonly description = 'Local yt-dlp binary via Electron. Works on Desktop only.'

  private get bridge(): YtdlpBridge {
    if (!window.ytdlp) throw new Error('yt-dlp bridge not available in this environment')
    return window.ytdlp
  }

  async isAvailable(): Promise<boolean> {
    return typeof window !== 'undefined' && !!window.ytdlp
  }

  async getVideoInfo(videoId: string): Promise<VideoInfo> {
    const raw = await this.bridge.getInfo(videoId)
    return rawToVideoInfo(raw)
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const results = await this.bridge.search(query, limit)
    return results.map(rawToSearchResult)
  }

  async getChannelInfo(channelId: string): Promise<ChannelInfo> {
    const raw = await this.bridge.getChannelInfo(channelId)
    return {
      channelId: raw.channel_id ?? channelId,
      name: raw.name,
      avatar: raw.avatar,
      description: raw.description,
    }
  }
}
