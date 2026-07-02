import { NodeJS } from 'capacitor-nodejs'

// ─── Promise bridge ───────────────────────────────────────────────────────────
// capacitor-nodejs uses an event bus, not request/response. We add correlation
// IDs so each invoke() call gets its own promise resolved by the matching reply.

let _nextId = 0
const _pending = new Map<number, { resolve: (v: unknown) => void; reject: (e: Error) => void }>()
let _listening = false

function ensureListener() {
  if (_listening) return
  _listening = true
  NodeJS.addListener('ytjs:result', (event) => {
    const { id, result, error } = event.args[0] as { id: number; result?: unknown; error?: string }
    const pending = _pending.get(id)
    if (!pending) return
    _pending.delete(id)
    if (error) pending.reject(new Error(error))
    else pending.resolve(result)
  })
}

function invoke(method: string, ...args: unknown[]): Promise<unknown> {
  ensureListener()
  return new Promise((resolve, reject) => {
    const id = _nextId++
    _pending.set(id, { resolve, reject })
    NodeJS.send({ eventName: 'ytjs:invoke', args: [{ id, method, args }] })
  })
}

// ─── Public API ───────────────────────────────────────────────────────────────
// Matches the shape of window.ytjs set by the Electron preload, so
// YoutubeJsPlugin works without modification on both platforms.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const cast = <T>(p: Promise<unknown>): Promise<T> => p as Promise<T>

export function initCapacitorYtjsBridge(): void {
  // The bridge matches the window.ytjs shape declared in src/plugins/youtubejs/index.ts
  // so YoutubeJsPlugin works unchanged on Capacitor.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  ;(window as any).ytjs = {
    setCookie: (cookie: string) => cast<void>(invoke('setCookie', cookie)),
    getInfo: (videoId: string) => cast(invoke('getInfo', videoId)),
    search: (query: string, limit?: number) => cast(invoke('search', query, limit ?? 10)),
    getChannelInfo: (channelId: string) => cast(invoke('getChannelInfo', channelId)),
    getChannelVideos: (channelId: string, limit?: number) => cast(invoke('getChannelVideos', channelId, limit ?? 30)),
    getChannelPlaylists: (channelId: string, limit?: number) => cast(invoke('getChannelPlaylists', channelId, limit ?? 20)),
  }
}
