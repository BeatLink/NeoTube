import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import path from 'path'
import fs from 'fs/promises'
import os from 'os'
import * as ytjsHandlers from './ytjs-handlers'

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
// Handler logic lives in ytjs-handlers.ts (shared with the mobile Node.js thread).

function registerYoutubeJsHandlers() {
  ipcMain.handle('ytjs:setCookie', (_event, cookie: string) => ytjsHandlers.setCookie(cookie))
  ipcMain.handle('ytjs:info', (_event, videoId: string) => ytjsHandlers.getInfo(videoId))
  ipcMain.handle('ytjs:search', (_event, query: string, limit: number) => ytjsHandlers.search(query, limit))
  ipcMain.handle('ytjs:channelInfo', (_event, channelId: string) => ytjsHandlers.getChannelInfo(channelId))
  ipcMain.handle('ytjs:channelVideos', (_event, channelId: string, limit = 30) => ytjsHandlers.getChannelVideos(channelId, limit))
  ipcMain.handle('ytjs:channelPlaylists', (_event, channelId: string, limit = 20) => ytjsHandlers.getChannelPlaylists(channelId, limit))
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

const _invHeaders = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:128.0) Gecko/20100101 Firefox/128.0',
  'Accept': 'application/json',
}

async function jsonFetch(url: string): Promise<unknown> {
  const res = await fetch(url, { headers: _invHeaders })
  const ct = res.headers.get('content-type') ?? ''
  if (!res.ok || !ct.includes('application/json')) {
    const body = await res.text()
    throw new Error(`Invidious API error ${res.status} from ${url}: ${body.slice(0, 120)}`)
  }
  return res.json()
}

function registerInvidiousHandlers() {
  ipcMain.handle('invidious:fetch', (_event, url: string) => jsonFetch(url))
  ipcMain.handle('invidious:fetchInstances', () =>
    jsonFetch('https://api.invidious.io/instances.json')
  )
}

app.whenReady().then(() => {
  registerAvatarHandlers()
  registerYtdlpHandlers()
  registerYoutubeJsHandlers()
  registerFreetubeHandlers()
  registerInvidiousHandlers()
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
