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
  // The owner block carries the channel avatar; primary_info has the dates and
  // the formatted view count.
  const owner = (info as any).secondary_info?.owner ?? {}
  const primary = (info as any).primary_info ?? {}
  const ownerThumbs: Array<{ url: string; width?: number }> = owner?.author?.thumbnails ?? []

  return {
    id: b.id as string | undefined,
    title: b.title as string | undefined,
    channel_id: b.channel?.id as string | undefined,
    channel_name: (b.channel?.name ?? b.author) as string | undefined,
    channel_avatar: (ownerThumbs.length
      ? [...ownerThumbs].sort((x, y) => (y.width ?? 0) - (x.width ?? 0))[0].url
      : '') as string,
    duration: b.duration as number | undefined,
    view_count: b.view_count as number | undefined,
    like_count: b.like_count as number | undefined,
    // "Oct 25, 2009" and "16 years ago" — both pre-formatted by YouTube.
    published_text: (primary?.published?.text ?? '') as string,
    published_relative: (primary?.relative_date?.text ?? '') as string,
    short_description: b.short_description as string | undefined,
    thumbnail: b.thumbnail?.[b.thumbnail.length - 1]?.url as string | undefined,
    formats: formats.filter(f => f.url),
  }
}

export interface RawComment {
  comment_id: string
  author: string
  author_avatar: string
  author_is_owner: boolean
  text: string
  like_count: string
  published_text: string
  reply_count: string
  is_pinned: boolean
}

/**
 * Fetches top-level comments for a video.
 *
 * Returns an empty list when comments are disabled rather than throwing, since
 * the Watch page treats them as optional.
 */
export async function getComments(videoId: string, limit = 20) {
  const yt = await getClient()
  let thread: any
  try { thread = await yt.getComments(videoId) } catch { return { comments: [], total_text: '' } }

  const raw: any[] = thread?.contents ?? thread?.comments ?? []
  const comments: RawComment[] = raw
    .map((item: any) => {
      const c = item?.comment ?? item
      if (!c?.comment_id) return null
      const thumbs: Array<{ url: string; width?: number }> = c?.author?.thumbnails ?? []
      return {
        comment_id: c.comment_id as string,
        author: (c.author?.name ?? '') as string,
        author_avatar: (thumbs.length
          ? [...thumbs].sort((x, y) => (y.width ?? 0) - (x.width ?? 0))[0].url
          : '') as string,
        author_is_owner: !!c.author_is_channel_owner,
        text: (c.content?.text ?? '') as string,
        like_count: (c.like_count ?? '') as string,
        published_text: (c.published_time ?? '') as string,
        reply_count: (c.reply_count ?? '') as string,
        is_pinned: !!c.is_pinned,
      }
    })
    .filter(Boolean) as RawComment[]

  return {
    comments: comments.slice(0, limit),
    total_text: (thread?.header?.count?.text ?? '') as string,
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

export async function searchChannels(query: string, limit: number) {
  const yt = await getClient()
  const results = await yt.search(query, { type: 'channel' })

  return ((results.channels ?? []) as any[]).slice(0, limit).map((c: any) => {
    const thumbs: Array<{ url: string; width?: number }> = c.author?.thumbnails ?? c.thumbnails ?? []
    const best = thumbs.length
      ? [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url
      : ''

    return {
      channel_id: (c.id ?? c.author?.id ?? '') as string,
      name: (c.author?.name ?? c.title?.text ?? '') as string,
      // Avatar URLs come back protocol-relative ("//yt3...").
      avatar: best.startsWith('//') ? `https:${best}` : best,
      // youtubei.js mislabels these: `subscriber_count` carries the @handle and
      // `video_count` carries the subscriber text. Read them by content, not name.
      handle: (c.subscriber_count?.text ?? '') as string,
      subscriber_count_text: (c.video_count?.text ?? '') as string,
      description: (c.description_snippet?.text ?? '') as string,
    }
  })
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

  // The banner lives under the newer PageHeader shape; pick the widest source.
  const banners: Array<{ url: string; width?: number }> =
    header?.content?.banner?.image ?? header?.banner?.image ?? []
  const banner = banners.length > 0
    ? [...banners].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url
    : ''

  // getAbout() carries the details panel (joined date, total views, location,
  // video count). It's a second request, so a failure degrades rather than
  // breaking the page.
  let about: any = {}
  try {
    about = (await channel.getAbout())?.metadata ?? {}
  } catch { /* details are optional */ }

  return {
    channel_id: channelId,
    name,
    avatar,
    banner,
    description: (about?.description ?? meta?.description ?? '') as string,
    subscriber_count_text: (about?.subscriber_count ?? subText) as string,
    // All pre-formatted by YouTube, e.g. "119,549,338 views", "35 videos".
    joined_text: (about?.joined_date?.text ?? '') as string,
    total_views_text: (about?.view_count ?? '') as string,
    video_count_text: (about?.video_count ?? '') as string,
    country: (about?.country ?? '') as string,
    tags: (meta?.tags ?? []) as string[],
    // Drives tab visibility. There is no equivalent flag for featured
    // channels — has_home is true even when the shelf is absent — so that tab
    // is decided by actually fetching the list.
    has_playlists: !!channel?.has_playlists,
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
/**
 * Order to request from YouTube. Sorting server-side matters because the only
 * date we get back is a humanized label ("8 years ago"): dozens of videos share
 * one, so sorting locally cannot separate them. YouTube orders by the real
 * timestamp.
 */
export type ChannelSort = 'Latest' | 'Popular' | 'Oldest'

export async function getChannelVideos(
  channelId: string,
  limit: number,
  onPage?: (videos: RawChannelVideo[], total: number) => void,
  sort: ChannelSort = 'Latest',
) {
  const yt = await getClient()
  const channel = await yt.getChannel(channelId) as any
  let feed: any
  try { feed = await channel.getVideos() } catch { return [] }

  // The chip bar lives on the videos tab. 'Latest' is the default, so only the
  // other orders need a request; a failure falls back to the default order.
  if (sort !== 'Latest') {
    try { feed = await feed.applyFilter(sort) } catch { /* keep default order */ }
  }

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

/**
 * Channels featured by this channel.
 *
 * YouTube retired the dedicated "Channels" tab; featured channels now appear as
 * a `GridChannel` shelf on the Home tab, so we scan the shelves for one.
 */
export async function getFeaturedChannels(channelId: string, limit: number) {
  const yt = await getClient()
  const channel = await yt.getChannel(channelId) as any
  if (!channel?.has_home) return []

  let home: any
  try { home = await channel.getHome() } catch { return [] }

  const shelves: any[] = home?.shelves ?? home?.contents ?? home?.items ?? []
  const featured: Array<{ channel_id: string; name: string; avatar: string }> = []
  const seen = new Set<string>()

  for (const shelf of shelves) {
    const items: any[] = shelf?.content?.items ?? shelf?.items ?? shelf?.contents ?? []
    for (const item of items) {
      const node = item?.content ?? item
      if (String(node?.type) !== 'GridChannel') continue

      const author = node.author ?? {}
      const id: string = node.id ?? author.id ?? ''
      if (!id || seen.has(id)) continue
      seen.add(id)

      const thumbs: Array<{ url: string; width?: number }> = author.thumbnails ?? []
      const best = thumbs.length
        ? [...thumbs].sort((a, b) => (b.width ?? 0) - (a.width ?? 0))[0].url
        : ''

      featured.push({
        channel_id: id,
        name: author.name ?? '',
        // These come back protocol-relative ("//yt3...").
        avatar: best.startsWith('//') ? `https:${best}` : best,
      })
      if (featured.length >= limit) return featured
    }
  }
  return featured
}

/**
 * Searches within a single channel.
 *
 * Covers the channel's whole catalogue, not just the videos already fetched
 * into the grid, so it finds old uploads the page has not paged to yet.
 */
export async function searchChannelVideos(
  channelId: string,
  query: string,
  limit: number,
) {
  const yt = await getClient()
  const channel = await yt.getChannel(channelId) as any
  if (typeof channel?.search !== 'function') return []

  let results: any
  try { results = await channel.search(query) } catch { return [] }

  // Search returns flat `Video` objects, not the `LockupView` shape the channel
  // grid uses, so these fields are read directly rather than via
  // parseChannelVideos().
  const raw: any[] = results?.videos ?? results?.items ?? results?.contents ?? []
  return raw
    .map((v: any): RawChannelVideo | null => {
      const id: string | undefined = v?.video_id ?? v?.id
      if (!id) return null
      const thumbs: Array<{ url: string }> = v?.thumbnails ?? []
      return {
        video_id: id,
        title: v?.title?.text ?? '',
        thumbnail: thumbs.length > 0 ? thumbs[0].url : '',
        duration: (v?.duration?.seconds ?? parseDurationText(v?.length_text?.text)) as number,
        // short_view_count is pre-abbreviated ("28M views"); view_count is exact.
        view_count_text: (v?.short_view_count?.text ?? v?.view_count?.text ?? '') as string,
        published_text: (v?.published?.text ?? '') as string,
      }
    })
    .filter(Boolean)
    .slice(0, limit) as RawChannelVideo[]
}

/** Parses "10:23" or "1:02:03" into seconds. */
function parseDurationText(text?: string): number {
  if (!text) return 0
  const parts = text.split(':').map(Number)
  if (parts.some(Number.isNaN)) return 0
  return parts.reduce((total, part) => total * 60 + part, 0)
}

/**
 * Fetches a playlist and its videos, following continuations.
 *
 * Items come back in the same `LockupView` shape as the channel grid, so
 * `parseChannelVideos` handles them.
 */
export async function getPlaylist(playlistId: string, limit = Infinity) {
  const yt = await getClient()
  const playlist = await yt.getPlaylist(playlistId) as any

  const videos = parseChannelVideos(playlist?.videos ?? playlist?.items ?? [])
  let feed = playlist
  let pages = 1
  while (videos.length < limit && feed?.has_continuation && pages < MAX_CHANNEL_PAGES) {
    try { feed = await feed.getContinuation() } catch { break }
    pages++
    const page = parseChannelVideos(feed?.videos ?? feed?.items ?? [])
    if (!page.length) break
    videos.push(...page)
  }

  const info = playlist?.info ?? {}
  const thumbs: Array<{ url: string; width?: number }> = info?.thumbnails ?? []
  return {
    playlist_id: playlistId,
    title: (info?.title ?? '') as string,
    description: (info?.description ?? '') as string,
    author: (info?.author?.name ?? '') as string,
    author_id: (info?.author?.id ?? '') as string,
    thumbnail: thumbs.length > 0 ? thumbs[0].url : '',
    total_items_text: (info?.total_items ?? '') as string,
    views_text: (info?.views ?? '') as string,
    videos: videos.slice(0, limit === Infinity ? undefined : limit),
  }
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
      // Newer responses use LockupView, where the id, title, thumbnail and
      // count all sit somewhere different from the legacy shape.
      const id: string | undefined = p?.id ?? p?.playlist_id ?? p?.content_id
      if (!id) return null

      const thumbs: Array<{ url: string }> =
        p?.content_image?.primary_thumbnail?.image
        ?? p?.thumbnails
        ?? p?.thumbnail
        ?? []

      // The video count arrives as a badge like "27 episodes".
      const badges: string[] = (p?.content_image?.primary_thumbnail?.overlays ?? [])
        .flatMap((o: any) => o?.badges ?? [])
        .map((b: any) => b?.text)
        .filter((t: unknown): t is string => typeof t === 'string')

      return {
        playlist_id: id as string,
        title: (p?.metadata?.title?.text ?? p?.title?.text ?? p?.title ?? '') as string,
        thumbnail: thumbs.length > 0 ? thumbs[0].url : '',
        video_count_text: (p?.video_count?.text ?? p?.video_count ?? badges[0] ?? null) as string | null,
      }
    })
    .filter(Boolean)
    .slice(0, limit) as Array<{ playlist_id: string; title: string; thumbnail: string; video_count_text: string | null }>
}
