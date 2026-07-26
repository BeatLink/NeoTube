import { describe, it, expect } from 'vitest'
import { formatViews, parseViewCount, parseRelativeAge } from '../src/utils/format'

describe('formatViews', () => {
  it('leaves counts under a thousand alone', () => {
    expect(formatViews(0)).toBe('0 views')
    expect(formatViews(42)).toBe('42 views')
    expect(formatViews(999)).toBe('999 views')
  })

  it('uses the singular for exactly one view', () => {
    expect(formatViews(1)).toBe('1 view')
  })

  it('abbreviates thousands', () => {
    expect(formatViews(1_000)).toBe('1K views')
    expect(formatViews(1_432)).toBe('1.4K views')
    expect(formatViews(128_231)).toBe('128K views')
  })

  it('abbreviates millions and billions', () => {
    expect(formatViews(1_400_000)).toBe('1.4M views')
    expect(formatViews(5_400_000)).toBe('5.4M views')
    expect(formatViews(2_100_000_000)).toBe('2.1B views')
  })

  // Above 100 a decimal adds noise, so those round to whole units.
  it('drops the decimal once the value reaches three digits', () => {
    expect(formatViews(128_000)).toBe('128K views')
    expect(formatViews(999_000)).toBe('999K views')
  })

  it('returns empty for invalid input rather than "NaN views"', () => {
    expect(formatViews(NaN)).toBe('')
    expect(formatViews(-5)).toBe('')
    expect(formatViews(Infinity)).toBe('')
  })
})

describe('parseViewCount', () => {
  it('parses abbreviated counts', () => {
    expect(parseViewCount('1.4M views')).toBe(1_400_000)
    expect(parseViewCount('7.7M views')).toBe(7_700_000)
    expect(parseViewCount('128K views')).toBe(128_000)
    expect(parseViewCount('2.1B views')).toBe(2_100_000_000)
  })

  it('parses exact counts with separators', () => {
    expect(parseViewCount('128,231 views')).toBe(128_231)
    expect(parseViewCount('42 views')).toBe(42)
  })

  // Live streams report "watching" instead of a view total.
  it('returns -1 for values it cannot parse, so they sort last', () => {
    expect(parseViewCount(undefined)).toBe(-1)
    expect(parseViewCount('')).toBe(-1)
    expect(parseViewCount('No views')).toBe(-1)
  })
})

describe('parseRelativeAge', () => {
  it('orders units correctly', () => {
    const day = parseRelativeAge('1 day ago')
    const week = parseRelativeAge('1 week ago')
    const month = parseRelativeAge('1 month ago')
    const year = parseRelativeAge('1 year ago')
    expect(day).toBeLessThan(week)
    expect(week).toBeLessThan(month)
    expect(month).toBeLessThan(year)
  })

  it('scales with the quantity', () => {
    expect(parseRelativeAge('8 years ago')).toBeGreaterThan(parseRelativeAge('2 years ago'))
    expect(parseRelativeAge('4 months ago')).toBeGreaterThan(parseRelativeAge('2 weeks ago'))
  })

  it('handles the "Streamed" prefix on live replays', () => {
    expect(parseRelativeAge('Streamed 2 years ago')).toBe(parseRelativeAge('2 years ago'))
  })

  it('returns Infinity when nothing parses, so unknown dates sort oldest', () => {
    expect(parseRelativeAge(undefined)).toBe(Infinity)
    expect(parseRelativeAge('')).toBe(Infinity)
    expect(parseRelativeAge('6.8K watching')).toBe(Infinity)
  })
})
