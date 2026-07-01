import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import { createContext, runInContext } from 'vm'
import path from 'path'

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
    // Fetch one flat entry from the channel to extract channel name / ID.
    // yt-dlp does not expose subscriber count or channel avatar via this path.
    const url = `https://www.youtube.com/channel/${channelId}`
    const raw = await runYtdlp(['--flat-playlist', '--dump-json', '--playlist-items', '1', url])
    const entry = JSON.parse(raw.trim().split('\n')[0])
    return {
      channel_id: entry.channel_id ?? channelId,
      name: entry.channel ?? entry.uploader ?? '',
      avatar: '',
      description: '',
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
    if (!channel.has_videos) return []
    const tab = await channel.getVideos()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = tab?.videos ?? tab?.items ?? []
    return items.slice(0, limit).map((v: any) => {
      const thumbs: Array<{ url: string }> = v.thumbnails ?? v.thumbnail ?? []
      return {
        video_id: v.id ?? v.video_id,
        title: v.title?.text ?? v.title ?? '',
        thumbnail: thumbs.length > 0 ? thumbs[thumbs.length - 1].url : '',
        duration: v.duration?.seconds ?? 0,
        view_count_text: v.view_count?.text ?? v.short_view_count?.text ?? '',
      }
    }).filter((v: any) => v.video_id)
  })

  ipcMain.handle('ytjs:channelPlaylists', async (_event, channelId: string, limit = 20) => {
    const yt = await getInnertubeClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const channel = await yt.getChannel(channelId) as any
    if (!channel.has_playlists) return []
    const tab = await channel.getPlaylists()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const items: any[] = tab?.playlists ?? tab?.items ?? []
    return items.slice(0, limit).map((p: any) => {
      const thumbs: Array<{ url: string }> = p.thumbnails ?? p.thumbnail ?? []
      return {
        playlist_id: p.id,
        title: p.title?.text ?? p.title ?? '',
        thumbnail: thumbs.length > 0 ? thumbs[0].url : '',
        video_count_text: p.video_count?.text ?? p.video_count ?? null,
      }
    }).filter((p: any) => p.playlist_id)
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
  registerYtdlpHandlers()
  registerYoutubeJsHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
