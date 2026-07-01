import { app, BrowserWindow, ipcMain } from 'electron'
import { fileURLToPath } from 'url'
import { spawn } from 'child_process'
import path from 'path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const isDev = process.env.NODE_ENV === 'development'

// ─── yt-dlp helpers ───────────────────────────────────────────────────────────

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
    const url = `https://www.youtube.com/watch?v=${videoId}`
    const raw = await runYtdlp(['--dump-json', '--no-playlist', url])
    return JSON.parse(raw)
  })

  ipcMain.handle('ytdlp:search', async (_event, query: string, limit: number = 10) => {
    const raw = await runYtdlp([
      '--flat-playlist',
      '--dump-json',
      '--no-playlist',
      `ytsearch${limit}:${query}`,
    ])
    // yt-dlp outputs one JSON object per line
    return raw
      .trim()
      .split('\n')
      .filter(Boolean)
      .map((line: string) => JSON.parse(line))
  })
}

// ─── Window ───────────────────────────────────────────────────────────────────

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
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
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
