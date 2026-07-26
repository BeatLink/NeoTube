/* eslint-disable @typescript-eslint/no-explicit-any */
import { isTauri, tauriFetch } from '../../utils/tauri'

// ─── Innertube singleton ──────────────────────────────────────────────────────

let _client: any = null
let _cookie = ''

async function buildClient(): Promise<any> {
  const { Innertube } = await import('youtubei.js')
  const opts: Record<string, any> = _cookie ? { cookie: _cookie } : {}
  // Under Tauri the webview enforces CORS, which YouTube's API does not satisfy.
  // Routing Innertube's requests through Rust's HTTP stack sidesteps it entirely.
  // The same shim serves desktop and mobile.
  if (isTauri()) {
    opts.fetch = tauriFetch
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

// YouTube only muxes video+audio up to 360p; everything above is adaptive
// (separate video-only and audio-only streams). To play those we hand a DASH
// manifest to dash.js.
//
// The IOS client is used because it returns unciphered stream URLs. WEB/ANDROID
// require running YouTube's player script to decipher signatures, which needs a
// JS evaluator we don't ship, and TV fails outright with the same error.
const STREAM_CLIENT = 'IOS'

/**
 * Builds a DASH manifest with segment URLs rewritten through the `ytstream://`
 * proxy (see `src-tauri/src/stream.rs`). Returns null in the browser, where the
 * proxy does not exist and adaptive playback is not possible.
 */
export async function getDashManifest(videoId: string): Promise<string | null> {
  if (!isTauri()) return null
  const yt = await getClient()
  const info = await yt.getInfo(videoId, { client: STREAM_CLIENT })
  return info.toDash({
    url_transformer: (url: URL) =>
      new URL(`ytstream://localhost/?url=${encodeURIComponent(url.toString())}`),
  })
}

export async function getInfo(videoId: string) {
  const yt = await getClient()
  const info = await yt.getInfo(videoId, { client: STREAM_CLIENT })
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
    // short_view_count is already abbreviated ("128K views"); view_count is not.
    view_count_text: (v.short_view_count?.text ?? v.view_count?.text) as string | undefined,
    published_text: v.published?.text as string | undefined,
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

interface RawChannelVideo {
  video_id: string
  title: string
  thumbnail: string
  duration: number
  /** Pre-formatted by YouTube, e.g. "1.4M views". */
  view_count_text: string
  /** Pre-formatted by YouTube, e.g. "2 weeks ago". */
  published_text: string
}

/**
 * Pulls the metadata line out of a `LockupView`, YouTube's newer channel-grid
 * shape. It arrives as pre-rendered text parts — typically ["1.4M views",
 * "2 weeks ago"] — rather than as a count and a timestamp.
 */
function lockupMetadataParts(v: any): string[] {
  const rows: any[] = v?.metadata?.metadata?.metadata_rows ?? []
  return rows
    .flatMap((row: any) => row?.metadata_parts ?? [])
    .map((part: any) => part?.text?.text)
    .filter((text: unknown): text is string => typeof text === 'string' && text.length > 0)
}

function parseChannelVideos(raw: any[]): RawChannelVideo[] {
  return raw
    .map((item: any) => {
      const v = item?.content ?? item
      const id: string | undefined = v?.video_id ?? v?.content_id
      if (!id) return null
      const title: string = v?.title?.text ?? v?.metadata?.title?.text ?? v?.title ?? ''
      const thumbs: Array<{ url: string }> =
        v?.thumbnails ?? v?.content_image?.image ?? v?.thumbnail ?? []

      // Older shapes expose these directly; LockupView hides them in text rows.
      const parts = lockupMetadataParts(v)
      const viewText = v?.view_count?.text ?? v?.short_view_count?.text
        ?? parts.find(p => /view/i.test(p)) ?? ''
      const publishedText = v?.published?.text
        ?? parts.find(p => /ago$/i.test(p)) ?? ''

      return {
        video_id: id,
        title,
        thumbnail: thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '',
        duration: (v?.duration?.seconds ?? v?.duration?.total_time ?? 0) as number,
        view_count_text: viewText as string,
        published_text: publishedText as string,
      }
    })
    .filter(Boolean) as RawChannelVideo[]
}

/**
 * Upper bound on continuation requests, so a channel with thousands of uploads
 * can't spin indefinitely. YouTube returns 30 videos per page, so this allows
 * roughly 3000 before stopping.
 */
const MAX_CHANNEL_PAGES = 100

/**
 * Fetches a channel's uploads, following continuations until `limit` is
 * reached. YouTube returns only 30 per response, so anything more needs paging.
 *
 * Pass `Infinity` for every video the channel has.
 */
export async function getChannelVideos(
  channelId: string,
  limit: number,
  onPage?: (videos: RawChannelVideo[], total: number) => void,
) {
  const yt = await getClient()
  const channel = await yt.getChannel(channelId) as any
  let feed: any
  try { feed = await channel.getVideos() } catch { return [] }

  const collected = parseChannelVideos(feed?.videos ?? feed?.items ?? feed?.contents ?? [])
  onPage?.(collected.slice(0, limit), collected.length)

  let pages = 1
  while (collected.length < limit && feed?.has_continuation && pages < MAX_CHANNEL_PAGES) {
    try {
      feed = await feed.getContinuation()
    } catch {
      break // Continuations expire; return what we have rather than failing.
    }
    pages++
    const page = parseChannelVideos(feed?.videos ?? feed?.items ?? feed?.contents ?? [])
    if (!page.length) break
    collected.push(...page)
    onPage?.(collected.slice(0, limit), collected.length)
  }

  return collected.slice(0, limit)
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
