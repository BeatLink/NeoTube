import { fetch as httpFetch } from '@tauri-apps/plugin-http'
import { invoke } from '@tauri-apps/api/core'

/**
 * True when running inside the Tauri shell (desktop or mobile) rather than a
 * plain browser. Tauri v2 sets `__TAURI_INTERNALS__` on the window.
 */
export function isTauri(): boolean {
  return typeof window !== 'undefined' && '__TAURI_INTERNALS__' in window
}

const YT_ORIGIN = 'https://www.youtube.com'

/**
 * `fetch` backed by Rust's HTTP stack, so requests are not subject to the
 * webview's CORS enforcement. This is what lets youtubei.js talk to YouTube
 * directly. Hosts must be allow-listed in `src-tauri/capabilities/default.json`.
 *
 * The webview stamps its own origin (`http://localhost:5173` in dev) onto every
 * request, and InnerTube answers 403 to any cross-origin value — an empty one
 * included. So we pin `Origin`/`Referer` to youtube.com, which it accepts as
 * same-origin.
 *
 * These must be *set*, not deleted: `@tauri-apps/plugin-http` builds its own
 * `Request` internally and merges the browser-generated headers back in for any
 * key the caller left unset, so a deleted `Origin` would simply reappear.
 */
export async function tauriFetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<Response> {
  const request = new Request(input as RequestInfo, init)

  const headers = new Headers(request.headers)
  headers.set('Origin', YT_ORIGIN)
  headers.set('Referer', `${YT_ORIGIN}/`)

  // A Request's body can only be read once, so buffer it before rebuilding.
  const body = request.method === 'GET' || request.method === 'HEAD'
    ? undefined
    : await request.arrayBuffer()

  return httpFetch(request.url, {
    method: request.method,
    headers,
    body,
  })
}

export interface FreetubeData {
  subscriptions: Array<{ id: string; name: string; thumbnail: string }>
  history: Array<{
    videoId: string
    title: string
    channelId: string
    channelName: string
    thumbnail: string
    duration: number
    watchedAt: string
  }>
}

/** Returns FreeTube data directories present on this machine. */
export function freetubeScan(): Promise<string[]> {
  return invoke<string[]>('freetube_scan')
}

/** Reads subscriptions and watch history from a FreeTube data directory. */
export function freetubeReadData(dir: string): Promise<FreetubeData> {
  return invoke<FreetubeData>('freetube_read_data', { dir })
}
