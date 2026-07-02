import { createContext, runInContext } from 'vm'

// ─── Innertube client ─────────────────────────────────────────────────────────

let _innertubeClient: unknown = null
let _ytjsCookie = ''

export async function getInnertubeClient() {
  if (!_innertubeClient) {
    const { Innertube, Platform } = await import('youtubei.js')
    Platform.load({
      ...Platform.shim,
      eval: (data: { output: string }, env: Record<string, unknown>) => {
        const ctx = createContext({ ...env })
        runInContext(data.output, ctx)
        return ctx as Record<string, unknown>
      },
    })
    _innertubeClient = await Innertube.create(_ytjsCookie ? { cookie: _ytjsCookie } : undefined)
  }
  return _innertubeClient as Awaited<ReturnType<typeof import('youtubei.js').Innertube.create>>
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

export async function setCookie(cookie: string): Promise<void> {
  _ytjsCookie = cookie ?? ''
  _innertubeClient = null
}

export async function getInfo(videoId: string) {
  const yt = await getInnertubeClient()
  const info = await yt.getInfo(videoId, { client: 'ANDROID' })
  const b = info.basic_info
  const allFormats = [
    ...(info.streaming_data?.formats ?? []),
    ...(info.streaming_data?.adaptive_formats ?? []),
  ]
  const formats = await Promise.all(allFormats.map(async f => {
    let url: string | undefined
    try { url = f.url ?? await f.decipher(yt.session.player) } catch { url = undefined }
    return {
      url,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      mime_type: (f as any).mime_type as string | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      quality_label: (f as any).quality_label as string | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      width: (f as any).width as number | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      height: (f as any).height as number | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      audio_channels: (f as any).audio_channels as number | undefined,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      bitrate: (f as any).bitrate as number | undefined,
    }
  }))
  return {
    id: b.id,
    title: b.title,
    channel_id: b.channel?.id,
    channel_name: b.channel?.name ?? b.author,
    duration: b.duration,
    view_count: b.view_count,
    short_description: b.short_description,
    thumbnail: b.thumbnail?.[b.thumbnail.length - 1]?.url,
    formats: formats.filter(f => f.url),
  }
}

export async function search(query: string, limit: number) {
  const yt = await getInnertubeClient()
  const results = await yt.search(query)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (results.videos ?? []).slice(0, limit).map((v: any) => ({
    video_id: v.video_id as string | undefined,
    title: v.title?.text as string | undefined,
    channel_name: v.author?.name as string | undefined,
    channel_id: v.author?.id as string | undefined,
    thumbnail: v.thumbnails?.[v.thumbnails.length - 1]?.url as string | undefined,
    length_text: v.length_text?.text as string | undefined,
  }))
}

export async function getChannelInfo(channelId: string) {
  const yt = await getInnertubeClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
  const yt = await getInnertubeClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = await yt.getChannel(channelId) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tab: any
  try { tab = await channel.getVideos() } catch { return [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = tab?.videos ?? tab?.items ?? tab?.contents ?? []
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    .slice(0, limit)
}

export async function getChannelPlaylists(channelId: string, limit: number) {
  const yt = await getInnertubeClient()
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const channel = await yt.getChannel(channelId) as any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let tab: any
  try { tab = await channel.getPlaylists() } catch { return [] }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: any[] = tab?.playlists ?? tab?.items ?? tab?.contents ?? []
  return raw
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    .slice(0, limit)
}
