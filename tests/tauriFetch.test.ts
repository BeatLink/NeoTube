import { describe, it, expect, vi, beforeEach } from 'vitest'

// Captures what the shim hands to @tauri-apps/plugin-http.
const httpFetch = vi.fn(async () => new Response('{}', { status: 200 }))

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: httpFetch }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const { tauriFetch } = await import('../src/utils/tauri')

function sentHeaders(): Headers {
  return httpFetch.mock.calls[0][1].headers as Headers
}

describe('tauriFetch', () => {
  beforeEach(() => { httpFetch.mockClear() })

  // InnerTube answers 403 to any cross-origin value, and plugin-http re-adds the
  // webview's own origin for headers the caller leaves unset — so these must be
  // explicitly set, not deleted.
  it('pins Origin to youtube.com', async () => {
    await tauriFetch('https://www.youtube.com/youtubei/v1/search')
    expect(sentHeaders().get('Origin')).toBe('https://www.youtube.com')
  })

  it('pins Referer to youtube.com', async () => {
    await tauriFetch('https://www.youtube.com/youtubei/v1/search')
    expect(sentHeaders().get('Referer')).toBe('https://www.youtube.com/')
  })

  it('overrides a caller-supplied Origin', async () => {
    await tauriFetch('https://www.youtube.com/youtubei/v1/search', {
      headers: { Origin: 'http://localhost:5173' },
    })
    expect(sentHeaders().get('Origin')).toBe('https://www.youtube.com')
  })

  it('preserves other headers and the method', async () => {
    await tauriFetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Goog-Visitor-Id': 'abc' },
      body: '{"query":"test"}',
    })
    const [, init] = httpFetch.mock.calls[0]
    expect(init.method).toBe('POST')
    expect(sentHeaders().get('Content-Type')).toBe('application/json')
    expect(sentHeaders().get('X-Goog-Visitor-Id')).toBe('abc')
  })

  it('forwards the request body', async () => {
    await tauriFetch('https://www.youtube.com/youtubei/v1/search', {
      method: 'POST',
      body: '{"query":"lofi"}',
    })
    const [, init] = httpFetch.mock.calls[0]
    expect(new TextDecoder().decode(init.body as ArrayBuffer)).toBe('{"query":"lofi"}')
  })

  it('sends no body for GET', async () => {
    await tauriFetch('https://i.ytimg.com/vi/abc/hqdefault.jpg')
    expect(httpFetch.mock.calls[0][1].body).toBeUndefined()
  })
})
