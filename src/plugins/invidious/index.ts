import type { VideoPlugin, VideoInfo, SearchResult, ChannelInfo, ChannelPlaylist, StreamUrl } from '../types'
import type {
  InvVideoResponse, InvSearchVideo, InvAdaptiveFormat,
  InvFormatStream, InvChannelResponse, InvChannelVideosResponse,
  InvChannelPlaylistsResponse, InvInstanceMeta,
} from './types'

// ─── Instance URL (shared across plugin instances) ────────────────────────────

let _instanceUrl = ''

// ─── Helpers ──────────────────────────────────────────────────────────────────

function bestThumbnail(thumbs: Array<{ url: string; width?: number }>): string {
  if (!thumbs?.length) return ''
  const sorted = [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))
  return sorted[0].url
}

function mimeToFormat(type: string): string {
  const mime = type.split(';')[0].trim()
  if (mime === 'video/mp4' || mime === 'audio/mp4') return 'mp4'
  if (mime === 'video/webm' || mime === 'audio/webm') return 'webm'
  return mime.split('/')[1] ?? 'mp4'
}

function heightFromLabel(label?: string): number | undefined {
  if (!label) return undefined
  const m = label.match(/^(\d+)p/)
  return m ? parseInt(m[1]) : undefined
}

function mapAdaptive(f: InvAdaptiveFormat): StreamUrl {
  const hasVideo = !!f.qualityLabel && !f.audioQuality
  const hasAudio = !!f.audioQuality && !f.qualityLabel
  const height = heightFromLabel(f.qualityLabel)
  return {
    url: f.url,
    quality: f.qualityLabel ?? (hasAudio ? 'audio only' : f.resolution ?? 'unknown'),
    format: f.container ?? mimeToFormat(f.type),
    width: undefined,
    height,
    bitrate: typeof f.bitrate === 'string' ? parseInt(f.bitrate) / 1000 : (f.bitrate ? f.bitrate / 1000 : undefined),
    hasVideo,
    hasAudio,
  }
}

function mapFormatStream(f: InvFormatStream): StreamUrl {
  const height = heightFromLabel(f.qualityLabel)
  return {
    url: f.url,
    quality: f.qualityLabel,
    format: f.container ?? mimeToFormat(f.type),
    height,
    hasVideo: true,
    hasAudio: true,
  }
}

function mapSearchVideo(v: InvSearchVideo): SearchResult {
  return {
    videoId: v.videoId,
    title: v.title,
    channelId: v.authorId,
    channelName: v.author,
    thumbnail: bestThumbnail(v.videoThumbnails),
    duration: v.lengthSeconds,
    viewCount: v.viewCount,
    publishedAt: v.published ? new Date(v.published * 1000).toISOString() : undefined,
  }
}

// ─── Plugin ───────────────────────────────────────────────────────────────────

export class InvidiousPlugin implements VideoPlugin {
  readonly id = 'invidious'
  readonly name = 'Invidious'
  readonly description = 'Privacy-respecting YouTube frontend. Requires a public or self-hosted Invidious instance.'

  static setInstance(url: string): void {
    _instanceUrl = url.replace(/\/+$/, '')
  }

  static getInstance(): string {
    return _instanceUrl
  }

  private get base(): string {
    return _instanceUrl
  }

  private async apiFetch<T>(path: string): Promise<T> {
    if (!this.base) throw new Error('No Invidious instance configured')
    const url = `${this.base}/api/v1${path}`
    const inv = (window as unknown as { invidious?: { fetch(url: string): Promise<T> } }).invidious
    if (inv?.fetch) return inv.fetch(url)
    const res = await fetch(url)
    if (!res.ok) throw new Error(`Invidious API error ${res.status}: ${path}`)
    return res.json() as Promise<T>
  }

  async isAvailable(): Promise<boolean> {
    return !!_instanceUrl
  }

  async getVideoInfo(videoId: string): Promise<VideoInfo> {
    const raw = await this.apiFetch<InvVideoResponse>(`/videos/${videoId}`)
    const adaptive = (raw.adaptiveFormats ?? []).map(mapAdaptive)
    const muxed = (raw.formatStreams ?? []).map(mapFormatStream)
    const streams: StreamUrl[] = [...adaptive, ...muxed]
      .filter(f => f.url)
      .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))
    return {
      videoId: raw.videoId,
      title: raw.title,
      channelId: raw.authorId,
      channelName: raw.author,
      description: raw.description ?? '',
      duration: raw.lengthSeconds,
      thumbnail: bestThumbnail(raw.videoThumbnails),
      publishedAt: raw.published ? new Date(raw.published * 1000).toISOString() : new Date().toISOString(),
      viewCount: raw.viewCount,
      streams,
    }
  }

  async search(query: string, limit = 10): Promise<SearchResult[]> {
    const results = await this.apiFetch<InvSearchVideo[]>(
      `/search?q=${encodeURIComponent(query)}&type=video&page=1`
    )
    return results.filter(r => r.type === 'video').slice(0, limit).map(mapSearchVideo)
  }

  async getChannelInfo(channelId: string): Promise<ChannelInfo> {
    const raw = await this.apiFetch<InvChannelResponse>(`/channels/${channelId}`)
    return {
      channelId: raw.authorId ?? channelId,
      name: raw.author,
      avatar: bestThumbnail(raw.authorThumbnails ?? []),
      description: raw.description,
      subscriberCount: raw.subCount,
    }
  }

  async getChannelVideos(channelId: string, limit = 30): Promise<SearchResult[]> {
    const raw = await this.apiFetch<InvChannelVideosResponse>(`/channels/${channelId}/videos`)
    return (raw.videos ?? []).slice(0, limit).map(mapSearchVideo)
  }

  async getChannelPlaylists(channelId: string, limit = 20): Promise<ChannelPlaylist[]> {
    const raw = await this.apiFetch<InvChannelPlaylistsResponse>(`/channels/${channelId}/playlists`)
    return (raw.playlists ?? []).slice(0, limit).map(p => ({
      playlistId: p.playlistId,
      title: p.title,
      thumbnail: p.playlistThumbnail ?? '',
      videoCount: p.videoCount,
    }))
  }
}

// ─── Instance discovery ───────────────────────────────────────────────────────

export interface InvidiousInstanceInfo {
  uri: string
  flag: string
  region: string
  uptime: number
  hasApi: boolean
}

export async function fetchInvidiousInstances(): Promise<InvidiousInstanceInfo[]> {
  type InvBridge = { fetchInstances(): Promise<unknown>; fetch(url: string): Promise<unknown> }
  const inv = (window as unknown as { invidious?: InvBridge }).invidious
  let list: Array<[string, InvInstanceMeta]>
  if (inv?.fetchInstances) {
    list = (await inv.fetchInstances()) as Array<[string, InvInstanceMeta]>
  } else {
    const res = await fetch('https://api.invidious.io/instances.json')
    if (!res.ok) throw new Error('Failed to fetch instance list')
    list = await res.json()
  }
  return list
    .filter(([, meta]) =>
      meta.type === 'https' &&
      !meta.monitor?.down
    )
    .map(([, meta]) => ({
      uri: meta.uri,
      flag: meta.flag ?? '🌐',
      region: meta.region ?? '??',
      uptime: meta.monitor?.uptime ?? 0,
      hasApi: !!meta.api,
    }))
    .sort((a, b) => {
      // API-enabled instances first, then by uptime
      if (a.hasApi !== b.hasApi) return a.hasApi ? -1 : 1
      return b.uptime - a.uptime
    })
}
