import { app, BrowserWindow, ipcMain, session } from 'electron'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
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

// ─── CORS headers ────────────────────────────────────────────────────────────
// youtube.js (Innertube) runs in the renderer. YouTube's API doesn't allow
// cross-origin requests from arbitrary origins, so we:
//   1. Strip Origin from outgoing requests (server skips CORS enforcement)
//   2. Inject Access-Control-Allow-Origin: * into responses (browser accepts them)
//   3. Force OPTIONS preflight responses to 200 so the browser proceeds

function registerCorsHeaders() {
  const urls = [
    'https://www.youtube.com/*',
    'https://music.youtube.com/*',
    'https://*.googlevideo.com/*',
    'https://i.ytimg.com/*',
    'https://yt3.ggpht.com/*',
    'https://yt3.googleusercontent.com/*',
  ]

  session.defaultSession.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    const headers = { ...details.requestHeaders }
    delete headers['Origin']
    delete headers['origin']
    callback({ requestHeaders: headers })
  })

  session.defaultSession.webRequest.onHeadersReceived({ urls }, (details, callback) => {
    const isPreflight = details.method === 'OPTIONS'
    const statusOk = !!details.statusLine?.match(/HTTP\/\S+ 2\d\d/)
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'access-control-allow-origin': ['*'],
        'access-control-allow-headers': ['*'],
        'access-control-allow-methods': ['GET, POST, OPTIONS, PUT, DELETE'],
      },
      ...(isPreflight && !statusOk ? { statusLine: 'HTTP/1.1 200 OK' } : {}),
    })
  })
}

// ─── Avatar download ─────────────────────────────────────────────────────────
// Fetches an image URL in the main process (no CORS restrictions) and returns
// it as a base64 data URI ready for storage in PouchDB.

function registerAvatarHandlers() {
  ipcMain.handle('avatar:download', async (_event, url: string) => {
    const response = await fetch(url)
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    const buffer = await response.arrayBuffer()
    const contentType = response.headers.get('content-type') ?? 'image/jpeg'
    const base64 = Buffer.from(buffer).toString('base64')
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
  registerCorsHeaders()
  registerAvatarHandlers()
  registerYtdlpHandlers()
  registerFreetubeHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
