import { describe, it, expect, beforeEach, vi } from 'vitest'
import { YtdlpPlugin } from '../src/plugins/ytdlp/index'
import type { YtdlpRawInfo } from '../src/plugins/ytdlp/types'

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const RAW_VIDEO: YtdlpRawInfo = {
  id: 'dQw4w9WgXcQ',
  title: 'Never Gonna Give You Up',
  uploader: 'Rick Astley',
  uploader_id: 'rickastley',
  channel: 'Rick Astley',
  channel_id: 'UCuAXFkgsw1L7xaCfnd5JJOw',
  duration: 213,
  view_count: 1_400_000_000,
  description: 'The official music video',
  upload_date: '20091025',
  thumbnail: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/maxresdefault.jpg',
  formats: [
    { format_id: '137', url: 'https://stream/1080', ext: 'mp4', width: 1920, height: 1080, tbr: 5000, vcodec: 'avc1', acodec: 'none' },
    { format_id: '140', url: 'https://stream/audio', ext: 'm4a', tbr: 128, vcodec: 'none', acodec: 'mp4a' },
    { format_id: '22',  url: 'https://stream/720',  ext: 'mp4', width: 1280, height: 720,  tbr: 2500, vcodec: 'avc1', acodec: 'mp4a' },
  ],
}

const RAW_SEARCH: YtdlpRawInfo[] = [
  { id: 'abc', title: 'Result 1', uploader: 'Chan A', uploader_id: 'chana', duration: 100 },
  { id: 'def', title: 'Result 2', uploader: 'Chan B', uploader_id: 'chanb', duration: 200 },
]

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  Object.defineProperty(window, 'ytdlp', {
    configurable: true,
    writable: true,
    value: {
      getInfo: vi.fn().mockResolvedValue(RAW_VIDEO),
      search: vi.fn().mockResolvedValue(RAW_SEARCH),
    },
  })
})

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('YtdlpPlugin.isAvailable', () => {
  it('returns true when window.ytdlp bridge is present', async () => {
    expect(await new YtdlpPlugin().isAvailable()).toBe(true)
  })

  it('returns false when bridge is absent', async () => {
    Object.defineProperty(window, 'ytdlp', { configurable: true, value: undefined })
    expect(await new YtdlpPlugin().isAvailable()).toBe(false)
  })
})

describe('YtdlpPlugin.getVideoInfo', () => {
  it('maps raw yt-dlp JSON to VideoInfo', async () => {
    const info = await new YtdlpPlugin().getVideoInfo('dQw4w9WgXcQ')
    expect(info.videoId).toBe('dQw4w9WgXcQ')
    expect(info.title).toBe('Never Gonna Give You Up')
    expect(info.channelName).toBe('Rick Astley')
    expect(info.duration).toBe(213)
    expect(info.viewCount).toBe(1_400_000_000)
    expect(info.publishedAt).toBe('2009-10-25T00:00:00.000Z')
  })

  it('sorts streams highest-resolution first', async () => {
    const { streams } = await new YtdlpPlugin().getVideoInfo('dQw4w9WgXcQ')
    expect(streams[0].quality).toBe('1080p')
  })

  it('correctly flags hasVideo and hasAudio on streams', async () => {
    const { streams } = await new YtdlpPlugin().getVideoInfo('dQw4w9WgXcQ')
    const videoOnly = streams.find(s => s.quality === '1080p')!
    const audioOnly = streams.find(s => s.quality === 'audio only')!
    const combined  = streams.find(s => s.quality === '720p')!
    expect(videoOnly.hasVideo).toBe(true)
    expect(videoOnly.hasAudio).toBe(false)
    expect(audioOnly.hasVideo).toBe(false)
    expect(audioOnly.hasAudio).toBe(true)
    expect(combined.hasVideo).toBe(true)
    expect(combined.hasAudio).toBe(true)
  })
})

describe('YtdlpPlugin.search', () => {
  it('maps search results', async () => {
    const results = await new YtdlpPlugin().search('rick astley')
    expect(results).toHaveLength(2)
    expect(results[0].videoId).toBe('abc')
    expect(results[1].channelName).toBe('Chan B')
  })

  it('passes limit to bridge', async () => {
    await new YtdlpPlugin().search('cats', 5)
    expect(window.ytdlp!.search).toHaveBeenCalledWith('cats', 5)
  })
})
