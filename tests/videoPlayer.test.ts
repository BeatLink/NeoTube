import { describe, it, expect } from 'vitest'
import { toQualityOptions } from '../src/components/VideoPlayer/VideoPlayer'

// Mirrors what YouTube actually publishes: every height in vp9/av01, with avc1
// added up to 1080p. Without de-duplication the picker shows each height 2–3×.
const YOUTUBE_REPRESENTATIONS = [
  { id: 'v0', height: 2160, codecs: 'vp09.00.50.08' },
  { id: 'v1', height: 2160, codecs: 'av01.0.12M.08' },
  { id: 'v2', height: 1080, codecs: 'vp09.00.40.08' },
  { id: 'v3', height: 1080, codecs: 'av01.0.08M.08' },
  { id: 'v4', height: 1080, codecs: 'avc1.640028' },
  { id: 'v5', height: 720, codecs: 'vp09.00.31.08' },
  { id: 'v6', height: 720, codecs: 'avc1.4D401F' },
]

describe('toQualityOptions', () => {
  it('lists each resolution exactly once', () => {
    const labels = toQualityOptions(YOUTUBE_REPRESENTATIONS).map(o => o.label)
    expect(labels).toEqual(['2160p', '1080p', '720p'])
  })

  it('sorts highest resolution first', () => {
    const heights = toQualityOptions(YOUTUBE_REPRESENTATIONS).map(o => parseInt(o.label))
    expect(heights).toEqual([...heights].sort((a, b) => b - a))
  })

  it('prefers the H.264 rendition when a height offers several codecs', () => {
    const options = toQualityOptions(YOUTUBE_REPRESENTATIONS)
    expect(options.find(o => o.label === '1080p')?.id).toBe('v4')
    expect(options.find(o => o.label === '720p')?.id).toBe('v6')
  })

  it('falls back to the first codec when no H.264 exists', () => {
    expect(toQualityOptions(YOUTUBE_REPRESENTATIONS).find(o => o.label === '2160p')?.id)
      .toBe('v0')
  })

  it('ignores audio representations, which carry no height', () => {
    const options = toQualityOptions([
      { id: 'a0', height: null, codecs: 'mp4a.40.2' },
      { id: 'v0', height: 720, codecs: 'avc1.4D401F' },
    ])
    expect(options).toEqual([{ id: 'v0', label: '720p' }])
  })

  it('returns nothing for an empty representation list', () => {
    expect(toQualityOptions([])).toEqual([])
  })
})
