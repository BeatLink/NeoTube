import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import { createContext, runInContext } from 'vm'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

// ─── yt-dlp ───────────────────────────────────────────────────────────────────

function runYtdlp(args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn('yt-dlp', args)
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

function registerYtdlpHandlers() {
  ipcMain.handle('ytdlp:info', async (_event, videoId: string) => {
    const raw = await runYtdlp(['--dump-json', '--no-playlist', `https://www.youtube.com/watch?v=${videoId}`])
    return JSON.parse(raw)
  })

  ipcMain.handle('ytdlp:search', async (_event, query: string, limit = 10) => {
    const raw = await runYtdlp(['--flat-playlist', '--dump-json', '--no-playlist', `ytsearch${limit}:${query}`])
    return raw.trim().split('\n').filter(Boolean).map((l: string) => JSON.parse(l))
  })

  ipcMain.handle('ytdlp:channelInfo', async (_event, channelId: string) => {
    // --dump-single-json returns channel-level JSON (including thumbnails); --flat-playlist
    // makes entries lightweight; --playlist-end 1 avoids processing more than one video.
    const url = `https://www.youtube.com/channel/${channelId}`
    const raw = await runYtdlp(['--flat-playlist', '--dump-single-json', '--playlist-end', '1', url])
    const data = JSON.parse(raw)
    type Thumb = { id?: string; url: string; width?: number }
    const thumbs: Thumb[] = data.thumbnails ?? []
    // Channel avatars have "avatar" in their id or come from yt3.ggpht.com
    const avatarThumb = thumbs.find(t => t.id?.toLowerCase().includes('avatar'))
      ?? thumbs.find(t => t.url?.includes('yt3.ggpht.com'))
    return {
      channel_id: data.channel_id ?? data.id ?? channelId,
      name: data.channel ?? data.title ?? data.uploader ?? '',
      avatar: avatarThumb?.url ?? '',
      description: data.description ?? '',
    }
  })

  ipcMain.handle('ytdlp:channelVideos', async (_event, channelId: string, limit = 30) => {
    const url = `https://www.youtube.com/channel/${channelId}/videos`
    const raw = await runYtdlp(['--flat-playlist', '--dump-json', '--playlist-end', String(limit), url])
    return raw.trim().split('\n').filter(Boolean).map((l: string) => JSON.parse(l))
  })

  ipcMain.handle('ytdlp:channelPlaylists', async (_event, channelId: string, limit = 20) => {
    const url = `https://www.youtube.com/channel/${channelId}/playlists`
    const raw = await runYtdlp(['--flat-playlist', '--dump-json', '--playlist-end', String(limit), url])
    return raw.trim().split('\n').filter(Boolean).map((l: string) => JSON.parse(l))
  })
}

// ─── youtube.js (Innertube) ───────────────────────────────────────────────────
// Runs in the main process to avoid browser CORS restrictions.

let _innertubeClient: unknown = null

async function getInnertubeClient() {
  if (!_innertubeClient) {
    const { Innertube, Platform } = await import('youtubei.js')
    // The default Node.js shim ships with a no-op eval that throws.
    // Override it with Node's vm module so signature/n-parameter deciphering works.
    Platform.load({
      ...Platform.shim,
      eval: (data: { output: string }, env: Record<string, unknown>) => {
        const ctx = createContext({ ...env })
        runInContext(data.output, ctx)
        return ctx as Record<string, unknown>
      },
    })
    _innertubeClient = await Innertube.create()
  }
  return _innertubeClient as Awaited<ReturnType<typeof import('youtubei.js').Innertube.create>>
}

function registerYoutubeJsHandlers() {
  ipcMain.handle('ytjs:info', async (_event, videoId: string) => {
    const yt = await getInnertubeClient()
    const info = await yt.getBasicInfo(videoId)
    // Serialise to plain object for IPC (class instances aren't cloneable)
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
        mime_type: (f as { mime_type?: string }).mime_type,
        quality_label: (f as { quality_label?: string }).quality_label,
        width: (f as { width?: number }).width,
        height: (f as { height?: number }).height,
        audio_channels: (f as { audio_channels?: number }).audio_channels,
        bitrate: (f as { bitrate?: number }).bitrate,
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
      formats,
    }
  })

  ipcMain.handle('ytjs:search', async (_event, query: string, limit: number) => {
    const yt = await getInnertubeClient()
    const results = await yt.search(query)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (results.videos ?? []).slice(0, limit).map((v: any) => ({
      video_id: v.video_id,
      title: v.title?.text,
      channel_name: v.author?.name,
      channel_id: v.author?.id,
      thumbnail: v.thumbnails?.[v.thumbnails.length - 1]?.url,
      length_text: v.length_text?.text,
    }))
  })

  ipcMain.handle('ytjs:channelInfo', async (_event, channelId: string) => {
    const yt = await getInnertubeClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = await yt.getChannel(channelId) as any
    const meta = channel?.metadata ?? {}
    const header = channel?.header ?? {}
    const name = header?.title?.text ?? meta?.title ?? ''
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
      description: meta?.description ?? '',
      subscriber_count_text: subText,
    }
  })

  ipcMain.handle('ytjs:channelVideos', async (_event, channelId: string, limit = 30) => {
    const yt = await getInnertubeClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = await yt.getChannel(channelId) as any
    let tab: any
    try { tab = await channel.getVideos() } catch { return [] }
    // Items may be in .videos or .items; each may be a RichItem wrapper with a .content child
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = tab?.videos ?? tab?.items ?? tab?.contents ?? []
    return raw
      .map((item: any) => {
        const v = item?.content ?? item   // unwrap RichItem / LockupView
        const id = v?.id ?? v?.video_id
        if (!id) return null
        const thumbs: Array<{ url: string }> = v?.thumbnails ?? v?.thumbnail ?? []
        return {
          video_id: id,
          title: v?.title?.text ?? v?.title ?? '',
          thumbnail: thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '',
          duration: v?.duration?.seconds ?? v?.duration?.total_time ?? 0,
          view_count_text: v?.view_count?.text ?? v?.short_view_count?.text ?? '',
        }
      })
      .filter(Boolean)
      .slice(0, limit)
  })

  ipcMain.handle('ytjs:channelPlaylists', async (_event, channelId: string, limit = 20) => {
    const yt = await getInnertubeClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = await yt.getChannel(channelId) as any
    let tab: any
    try { tab = await channel.getPlaylists() } catch { return [] }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const raw: any[] = tab?.playlists ?? tab?.items ?? tab?.contents ?? []
    return raw
      .map((item: any) => {
        const p = item?.content ?? item
        const id = p?.id ?? p?.playlist_id
        if (!id) return null
        const thumbs: Array<{ url: string }> = p?.thumbnails ?? p?.thumbnail ?? []
        return {
          playlist_id: id,
          title: p?.title?.text ?? p?.title ?? '',
          thumbnail: thumbs.length > 0 ? thumbs[0].url : '',
          video_count_text: p?.video_count?.text ?? p?.video_count ?? null,
        }
      })
      .filter(Boolean)
      .slice(0, limit)
  })
}

// ─── Avatar download ─────────────────────────────────────────────────────────
// Fetches an image URL in the main process (no CORS restrictions) and returns
// it as a base64 data URI ready for storage in PouchDB.

function registerAvatarHandlers() {
  ipcMain.handle('avatar:download', async (_event, url: string) => {
    console.log('[avatar:download]', url.slice(0, 80))
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    const base64 = Buffer.from(buffer).toString('base64')
    console.log('[avatar:download] ok', contentType, buffer.byteLength, 'bytes')
    return `data:${contentType};base64,${base64}`
  })
}

// ─── FreeTube import ─────────────────────────────────────────────────────────

function registerFreetubeHandlers() {
  // Search well-known FreeTube data directories and return the ones that exist.
  ipcMain.handle('freetube:scan', async () => {
    const home = os.homedir()
    const candidates = [
      path.join(home, '.config', 'FreeTube'),
      path.join(home, '.var', 'app', 'io.freetubeapp.FreeTube', 'config', 'FreeTube'),
      path.join(home, 'snap', 'freetube', 'current', '.config', 'FreeTube'),
      path.join(home, 'AppData', 'Roaming', 'FreeTube'),
      path.join(home, 'Library', 'Application Support', 'FreeTube'),
    ]
    const found: string[] = []
    for (const dir of candidates) {
      try {
        await fs.access(path.join(dir, 'profiles.db'))
        found.push(dir)
      } catch { /* not present */ }
    }
    return found
  })

  // Read and parse profiles.db and history.db from a given FreeTube data dir.
  ipcMain.handle('freetube:readData', async (_event, dir: string) => {
    // FreeTube older versions use NDJSON; newer versions use a plain JSON array.
    function parseDb(raw: string): unknown[] {
      const t = raw.trim()
      try {
        const v = JSON.parse(t)
        return Array.isArray(v) ? v : [v]
      } catch {
        return t.split('\n').filter(Boolean).map(l => JSON.parse(l))
      }
    }

    type FtSub = { id: string; name: string; thumbnail?: string }
    type FtEntry = {
      videoId?: string; id?: string; title?: string
      author?: string; authorId?: string
      lengthSeconds?: number; timeWatched?: number
      videoThumbnails?: Array<{ url: string }>
    }

    const subscriptions: FtSub[] = []
    try {
      const raw = await fs.readFile(path.join(dir, 'profiles.db'), 'utf-8')
      const profiles = parseDb(raw) as Array<{ subscriptions?: FtSub[] }>
      const seen = new Set<string>()
      for (const profile of profiles) {
        for (const sub of profile?.subscriptions ?? []) {
          if (sub?.id && sub?.name && !seen.has(sub.id)) {
            seen.add(sub.id)
            subscriptions.push({ id: sub.id, name: sub.name, thumbnail: sub.thumbnail ?? '' })
          }
        }
      }
    } catch { /* missing or corrupt */ }

    const history: Array<{
      videoId: string; title: string; channelId: string; channelName: string
      thumbnail: string; duration: number; watchedAt: string
    }> = []
    try {
      const raw = await fs.readFile(path.join(dir, 'history.db'), 'utf-8')
      const entries = parseDb(raw) as FtEntry[]
      for (const e of entries) {
        const videoId = e.videoId ?? e.id ?? ''
        if (!videoId) continue
        history.push({
          videoId,
          title: e.title ?? '',
          channelId: e.authorId ?? '',
          channelName: e.author ?? '',
          thumbnail: e.videoThumbnails?.[0]?.url || `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`,
          duration: e.lengthSeconds ?? 0,
          // timeWatched is a Unix timestamp in seconds
          watchedAt: e.timeWatched
            ? new Date(e.timeWatched * 1000).toISOString()
            : new Date().toISOString(),
        })
      }
    } catch { /* missing or corrupt */ }

    return { subscriptions, history }
  })
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      // preload.cjs compiled as CommonJS — compatible with Electron's sandboxed renderer
      preload: path.join(__dirname, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  })

  if (isDev) {
    win.loadURL('http://localhost:5173')
    win.webContents.openDevTools()
  } else {
    win.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  registerAvatarHandlers()
  registerYtdlpHandlers()
  registerYoutubeJsHandlers()
  registerFreetubeHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
