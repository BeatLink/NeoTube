/* eslint-disable @typescript-eslint/no-explicit-any */
import { createContext, runInContext } from 'vm'
import type { StreamUrl, SearchResult, ChannelInfo, ChannelPlaylist, CachedVideo } from './types.js'

// ─── Innertube singleton ──────────────────────────────────────────────────────
// Runs in Node.js — no CORS, no browser shims needed.
// vm.createContext is used for URL deciphering so the player JS runs in a
// sandboxed context rather than the server's global scope.

let _client: any = null
let _cookie = ''

async function buildClient(): Promise<any> {
  const { Innertube, Platform } = await import('youtubei.js')
  Platform.load({
    ...Platform.shim,
    eval: (data: { output: string }, env: Record<string, unknown>) => {
      const ctx = createContext({ ...env })
      runInContext(data.output, ctx)
      return ctx as Record<string, unknown>
    },
  })
  return Innertube.create(_cookie ? { cookie: _cookie } : undefined)
}

export async function getClient(): Promise<any> {
  if (!_client) _client = await buildClient()
  return _client
}

export async function setCookie(cookie: string): Promise<void> {
  _cookie = cookie ?? ''
  _client = null
}

// ─── Video info ───────────────────────────────────────────────────────────────

export async function getInfo(videoId: string): Promise<{
  videoId: string; title: string; channelId: string; channelName: string
  description: string; duration: number; thumbnail: string; publishedAt: string
  viewCount?: number; streams: StreamUrl[]
}> {
  const yt = await getClient()
  const info = await yt.getInfo(videoId, { client: 'ANDROID' })
  const b = info.basic_info
  const allFormats = [
    ...(info.streaming_data?.formats ?? []),
    ...(info.streaming_data?.adaptive_formats ?? []),
  ]
  const streams: StreamUrl[] = (await Promise.all(allFormats.map(async (f: any) => {
    let url: string | undefined
    try { url = f.url ?? await f.decipher(yt.session.player) } catch { return null }
    if (!url) return null
    const mime: string = f.mime_type ?? ''
    const ext = mime.split('/')[1]?.split(';')[0] ?? 'mp4'
    const hasVideo = mime.startsWith('video/')
    const hasAudio = !!(f.audio_channels) || mime.startsWith('audio/')
    return {
      url,
      quality: (f.quality_label as string | undefined) ?? (hasAudio && !hasVideo ? 'audio only' : 'unknown'),
      format: ext,
      width: f.width as number | undefined,
      height: f.height as number | undefined,
      hasVideo,
      hasAudio,
    } satisfies StreamUrl
  }))).filter((s): s is StreamUrl => s !== null)
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))

  return {
    videoId: b.id ?? videoId,
    title: b.title ?? '',
    channelId: b.channel?.id ?? '',
    channelName: b.channel?.name ?? b.author ?? '',
    description: b.short_description ?? '',
    duration: b.duration ?? 0,
    thumbnail: b.thumbnail?.[b.thumbnail.length - 1]?.url ?? '',
    publishedAt: '',
    viewCount: b.view_count,
    streams,
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

function parseDuration(text?: string | null): number {
  if (!text) return 0
  const parts = text.split(':').map(Number)
  if (parts.length === 3) return parts[0] * 3600 + parts[1] * 60 + parts[2]
  if (parts.length === 2) return parts[0] * 60 + parts[1]
  return 0
}

export async function search(query: string, limit: number): Promise<SearchResult[]> {
  const yt = await getClient()
  const results = await yt.search(query)
  return ((results.videos ?? []) as any[]).slice(0, limit).map((v: any) => ({
    videoId: (v.video_id as string | undefined) ?? '',
    title: (v.title?.text as string | undefined) ?? '',
    channelId: (v.author?.id as string | undefined) ?? '',
    channelName: (v.author?.name as string | undefined) ?? '',
    thumbnail: (v.thumbnails?.[v.thumbnails.length - 1]?.url as string | undefined) ?? '',
    duration: parseDuration(v.length_text?.text),
    viewCount: undefined,
  }))
}

// ─── Channel ──────────────────────────────────────────────────────────────────

export async function getChannelInfo(channelId: string): Promise<ChannelInfo> {
  const yt = await getClient()
  const channel = await yt.getChannel(channelId) as any
  const meta = channel?.metadata ?? {}
  const header = channel?.header ?? {}
  const name: string = header?.title?.text ?? meta?.title ?? ''
  const avatars: Array<{ url: string; width?: number }> =
    header?.avatar?.image?.sources ?? meta?.thumbnail ?? []
  const avatar = avatars.length > 0
    ? avatars.sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url
    : ''
  const subText: string = header?.subscribers?.subscriber_count?.text ?? ''
  let subscriberCount: number | undefined
  if (subText) {
    const num = parseFloat(subText.replace(/,/g, ''))
    if (!isNaN(num)) {
      const lower = subText.toLowerCase()
      if (lower.includes('k')) subscriberCount = Math.round(num * 1_000)
      else if (lower.includes('m')) subscriberCount = Math.round(num * 1_000_000)
      else if (lower.includes('b')) subscriberCount = Math.round(num * 1_000_000_000)
      else subscriberCount = Math.round(num)
    }
  }
  return {
    channelId,
    name,
    avatar,
    description: (meta?.description ?? '') as string,
    subscriberCount,
  }
}

export async function getChannelVideos(channelId: string, limit: number): Promise<CachedVideo[]> {
  const yt = await getClient()
  const channel = await yt.getChannel(channelId) as any
  let tab: any
  try { tab = await channel.getVideos() } catch { return [] }
  const raw: any[] = tab?.videos ?? tab?.items ?? tab?.contents ?? []
  return raw
    .map((item: any) => {
      const v = item?.content ?? item
      const id: string | undefined = v?.video_id ?? v?.content_id
      if (!id) return null
      const title: string = v?.title?.text ?? v?.metadata?.title?.text ?? v?.title ?? ''
      const thumbs: Array<{ url: string }> =
        v?.thumbnails ?? v?.content_image?.image ?? v?.thumbnail ?? []
      return {
        videoId: id,
        title,
        channelId,
        channelName: '',
        thumbnail: thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '',
        duration: (v?.duration?.seconds ?? v?.duration?.total_time ?? 0) as number,
      } satisfies CachedVideo
    })
    .filter((v): v is CachedVideo => v !== null)
    .slice(0, limit)
}

export async function getChannelPlaylists(channelId: string, limit: number): Promise<ChannelPlaylist[]> {
  const yt = await getClient()
  const channel = await yt.getChannel(channelId) as any
  let tab: any
  try { tab = await channel.getPlaylists() } catch { return [] }
  const raw: any[] = tab?.playlists ?? tab?.items ?? tab?.contents ?? []
  return raw
    .map((item: any) => {
      const p = item?.content ?? item
      const id = p?.id ?? p?.playlist_id
      if (!id) return null
      const thumbs: Array<{ url: string }> = p?.thumbnails ?? p?.thumbnail ?? []
      const countText: string = p?.video_count?.text ?? p?.video_count ?? ''
      const countNum = parseInt(String(countText).replace(/\D/g, ''), 10)
      return {
        playlistId: id as string,
        title: (p?.title?.text ?? p?.title ?? '') as string,
        thumbnail: thumbs.length > 0 ? thumbs[0].url : '',
        videoCount: isNaN(countNum) ? undefined : countNum,
      } satisfies ChannelPlaylist
    })
    .filter((p): p is ChannelPlaylist => p !== null)
    .slice(0, limit)
}
