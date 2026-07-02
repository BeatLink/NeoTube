/* eslint-disable @typescript-eslint/no-explicit-any */
import { Capacitor, CapacitorHttp } from '@capacitor/core'

// ─── Capacitor fetch wrapper ──────────────────────────────────────────────────
// Routes requests through native HTTP to bypass WebView CORS restrictions.
// Only used when Capacitor.isNativePlatform() is true.

async function capacitorFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const url = input instanceof Request ? input.url : String(input)
  const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase()

  const reqHeaders: Record<string, string> = {}
  const src = init?.headers ?? (input instanceof Request ? input.headers : undefined)
  if (src instanceof Headers) {
    src.forEach((v, k) => { reqHeaders[k] = v })
  } else if (src && typeof src === 'object') {
    Object.assign(reqHeaders, src as Record<string, string>)
  }

  let data: unknown
  const rawBody = init?.body ?? undefined
  if (rawBody) {
    if (typeof rawBody === 'string') {
      try { data = JSON.parse(rawBody) } catch { data = rawBody }
    } else {
      data = rawBody
    }
  }

  const res = await CapacitorHttp.request({ url, method, headers: reqHeaders, data })
  const bodyStr = typeof res.data === 'string' ? res.data : JSON.stringify(res.data)
  return new Response(bodyStr, { status: res.status, headers: res.headers })
}

// ─── Innertube singleton ──────────────────────────────────────────────────────

let _client: any = null
let _cookie = ''

async function buildClient(): Promise<any> {
  const { Innertube } = await import('youtubei.js')
  const opts: Record<string, any> = _cookie ? { cookie: _cookie } : {}
  if (Capacitor.isNativePlatform()) {
    opts.fetch = capacitorFetch
  }
  return Innertube.create(opts)
}

export async function getClient(): Promise<any> {
  if (!_client) _client = await buildClient()
  return _client
}

export async function setCookie(cookie: string): Promise<void> {
  _cookie = cookie ?? ''
  _client = null
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function getInfo(videoId: string) {
  const yt = await getClient()
  const info = await yt.getInfo(videoId, { client: 'ANDROID' })
  const b = info.basic_info
  const allFormats = [
    ...(info.streaming_data?.formats ?? []),
    ...(info.streaming_data?.adaptive_formats ?? []),
  ]
  const formats = await Promise.all(allFormats.map(async (f: any) => {
    let url: string | undefined
    try { url = f.url ?? await f.decipher(yt.session.player) } catch { url = undefined }
    return {
      url,
      mime_type: f.mime_type as string | undefined,
      quality_label: f.quality_label as string | undefined,
      width: f.width as number | undefined,
      height: f.height as number | undefined,
      audio_channels: f.audio_channels as number | undefined,
      bitrate: f.bitrate as number | undefined,
    }
  }))
  return {
    id: b.id as string | undefined,
    title: b.title as string | undefined,
    channel_id: b.channel?.id as string | undefined,
    channel_name: (b.channel?.name ?? b.author) as string | undefined,
    duration: b.duration as number | undefined,
    view_count: b.view_count as number | undefined,
    short_description: b.short_description as string | undefined,
    thumbnail: b.thumbnail?.[b.thumbnail.length - 1]?.url as string | undefined,
    formats: formats.filter(f => f.url),
  }
}

export async function search(query: string, limit: number) {
  const yt = await getClient()
  const results = await yt.search(query)
  return ((results.videos ?? []) as any[]).slice(0, limit).map((v: any) => ({
    video_id: v.video_id as string | undefined,
    title: v.title?.text as string | undefined,
    channel_name: v.author?.name as string | undefined,
    channel_id: v.author?.id as string | undefined,
    thumbnail: v.thumbnails?.[v.thumbnails.length - 1]?.url as string | undefined,
    length_text: v.length_text?.text as string | undefined,
  }))
}

export async function getChannelInfo(channelId: string) {
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
  return {
    channel_id: channelId,
    name,
    avatar,
    description: (meta?.description ?? '') as string,
    subscriber_count_text: subText,
  }
}

export async function getChannelVideos(channelId: string, limit: number) {
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
        video_id: id,
        title,
        thumbnail: thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '',
        duration: (v?.duration?.seconds ?? v?.duration?.total_time ?? 0) as number,
        view_count_text: (v?.view_count?.text ?? v?.short_view_count?.text ?? '') as string,
      }
    })
    .filter(Boolean)
    .slice(0, limit) as Array<{ video_id: string; title: string; thumbnail: string; duration: number; view_count_text: string }>
}

export async function getChannelPlaylists(channelId: string, limit: number) {
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
      return {
        playlist_id: id as string,
        title: (p?.title?.text ?? p?.title ?? '') as string,
        thumbnail: thumbs.length > 0 ? thumbs[0].url : '',
        video_count_text: (p?.video_count?.text ?? p?.video_count ?? null) as string | null,
      }
    })
    .filter(Boolean)
    .slice(0, limit) as Array<{ playlist_id: string; title: string; thumbnail: string; video_count_text: string | null }>
}
