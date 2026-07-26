import { describe, it, expect } from 'vitest'
import { formatViews } from '../src/utils/format'

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
