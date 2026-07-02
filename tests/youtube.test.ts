import { describe, it, expect } from 'vitest'
import { parseVideoId } from '../src/utils/youtube'

const ID = 'dQw4w9WgXcQ'

describe('parseVideoId', () => {
  it('handles standard watch URL', () => {
    expect(parseVideoId(`https://www.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('handles youtu.be short link', () => {
    expect(parseVideoId(`https://youtu.be/${ID}`)).toBe(ID)
  })

  it('handles youtu.be with query params', () => {
    expect(parseVideoId(`https://youtu.be/${ID}?si=abc123`)).toBe(ID)
  })

  it('handles mobile URL', () => {
    expect(parseVideoId(`https://m.youtube.com/watch?v=${ID}`)).toBe(ID)
  })

  it('handles shorts URL', () => {
    expect(parseVideoId(`https://www.youtube.com/shorts/${ID}`)).toBe(ID)
  })

  it('handles embed URL', () => {
    expect(parseVideoId(`https://www.youtube.com/embed/${ID}`)).toBe(ID)
  })

  it('handles bare 11-character video ID', () => {
    expect(parseVideoId(ID)).toBe(ID)
  })

  it('strips leading/trailing whitespace', () => {
    expect(parseVideoId(`  https://youtu.be/${ID}  `)).toBe(ID)
  })

  it('returns null for non-YouTube URL', () => {
    expect(parseVideoId('https://vimeo.com/123456')).toBeNull()
  })

  it('returns null for empty string', () => {
    expect(parseVideoId('')).toBeNull()
  })

  it('returns null for plain text', () => {
    expect(parseVideoId('not a url')).toBeNull()
  })

  it('returns null for YouTube URL with no video ID', () => {
    expect(parseVideoId('https://www.youtube.com/feed/subscriptions')).toBeNull()
  })
})
