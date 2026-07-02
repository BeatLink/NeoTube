import { spawn } from 'child_process'
import type { SearchResult, ChannelInfo, ChannelPlaylist, CachedVideo, StreamUrl } from './types.js'

const ytdlpBin = process.env.YTDLP_PATH ?? 'yt-dlp'

function run(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(ytdlpBin, args)
    let stdout = ''
    let stderr = ''
    proc.stdout.on('data', (d: Buffer) => { stdout += d.toString() })
    proc.stderr.on('data', (d: Buffer) => { stderr += d.toString() })
    proc.on('close', code => {
      if (code === 0) resolve(stdout)
      else reject(new Error(stderr || `yt-dlp exited with code ${code}`))
    })
    proc.on('error', reject)
  })
}

// ─── Video info ───────────────────────────────────────────────────────────────

export async function getInfo(videoId: string) {
  const raw = await run(['--dump-json', '--no-playlist', `https://www.youtube.com/watch?v=${videoId}`])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = JSON.parse(raw) as any

  type RawFmt = {
    url?: string; ext?: string; vcodec?: string; acodec?: string
    format_note?: string; width?: number; height?: number
    tbr?: number; abr?: number; vbr?: number
  }
  const streams: StreamUrl[] = ((data.formats ?? []) as RawFmt[])
    .filter(f => f.url)
    .map(f => {
      const hasVideo = f.vcodec !== 'none' && !!f.vcodec
      const hasAudio = f.acodec !== 'none' && !!f.acodec
      return {
        url: f.url!,
        quality: f.format_note ?? (hasAudio && !hasVideo ? 'audio only' : 'unknown'),
        format: f.ext ?? 'mp4',
        width: f.width,
        height: f.height,
        hasVideo,
        hasAudio,
      } satisfies StreamUrl
    })
    .sort((a, b) => (b.height ?? 0) - (a.height ?? 0))

  return {
    videoId,
    title: (data.title as string) ?? '',
    channelId: (data.channel_id as string) ?? '',
    channelName: (data.channel as string) ?? (data.uploader as string) ?? '',
    description: (data.description as string) ?? '',
    duration: (data.duration as number) ?? 0,
    thumbnail: (data.thumbnail as string) ?? '',
    publishedAt: (data.upload_date as string) ?? '',
    viewCount: data.view_count as number | undefined,
    streams,
  }
}

// ─── Search ───────────────────────────────────────────────────────────────────

export async function search(query: string, limit: number): Promise<SearchResult[]> {
  const raw = await run(['--flat-playlist', '--dump-json', '--no-playlist', `ytsearch${limit}:${query}`])
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return raw.trim().split('\n').filter(Boolean).map((line: string) => {
    const v = JSON.parse(line) as any
    return {
      videoId: (v.id as string) ?? '',
      title: (v.title as string) ?? '',
      channelId: (v.channel_id as string) ?? '',
      channelName: (v.channel as string) ?? (v.uploader as string) ?? '',
      thumbnail: (v.thumbnail as string) ?? '',
      duration: (v.duration as number) ?? 0,
      viewCount: v.view_count as number | undefined,
    } satisfies SearchResult
  })
}

// ─── Channel ──────────────────────────────────────────────────────────────────

export async function getChannelInfo(channelId: string): Promise<ChannelInfo> {
  const url = `https://www.youtube.com/channel/${channelId}`
  const raw = await run(['--flat-playlist', '--dump-single-json', '--playlist-end', '1', url])
  const data = JSON.parse(raw) as any
  type Thumb = { id?: string; url: string; width?: number }
  const thumbs: Thumb[] = data.thumbnails ?? []
  const avatarThumb = thumbs.find(t => t.id?.toLowerCase().includes('avatar'))
    ?? thumbs.find(t => t.url?.includes('yt3.ggpht.com'))
  return {
    channelId: (data.channel_id ?? data.id ?? channelId) as string,
    name: (data.channel ?? data.title ?? data.uploader ?? '') as string,
    avatar: avatarThumb?.url ?? '',
    description: (data.description ?? '') as string,
  }
}

export async function getChannelVideos(channelId: string, limit: number): Promise<CachedVideo[]> {
  const url = `https://www.youtube.com/channel/${channelId}/videos`
  const raw = await run(['--flat-playlist', '--dump-json', '--playlist-end', String(limit), url])
  return raw.trim().split('\n').filter(Boolean).map((line: string) => {
    const v = JSON.parse(line) as any
    return {
      videoId: (v.id as string) ?? '',
      title: (v.title as string) ?? '',
      channelId,
      channelName: '',
      thumbnail: (v.thumbnail as string) ?? '',
      duration: (v.duration as number) ?? 0,
    } satisfies CachedVideo
  })
}

export async function getChannelPlaylists(channelId: string, limit: number): Promise<ChannelPlaylist[]> {
  const url = `https://www.youtube.com/channel/${channelId}/playlists`
  const raw = await run(['--flat-playlist', '--dump-json', '--playlist-end', String(limit), url])
  return raw.trim().split('\n').filter(Boolean).map((line: string) => {
    const p = JSON.parse(line) as any
    return {
      playlistId: (p.id as string) ?? '',
      title: (p.title as string) ?? '',
      thumbnail: (p.thumbnail as string) ?? '',
      videoCount: p.playlist_count as number | undefined,
    } satisfies ChannelPlaylist
  })
}
