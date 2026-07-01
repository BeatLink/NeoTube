import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
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
}

// ─── youtube.js (Innertube) ───────────────────────────────────────────────────
// Runs in the main process to avoid browser CORS restrictions.

let _innertubeClient: unknown = null

async function getInnertubeClient() {
  if (!_innertubeClient) {
    const { Innertube } = await import('youtubei.js')
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
