import { describe, it, expect, vi } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useVideoPlayback } from '../src/hooks/useVideoPlayback'

/** Minimal stand-in for the parts of HTMLMediaElement the hook touches. */
function fakeVideo(overrides: Partial<HTMLVideoElement> = {}) {
  return {
    currentTime: 0,
    duration: 300,
    paused: true,
    ended: false,
    volume: 1,
    muted: false,
    playbackRate: 1,
    readyState: 4,
    buffered: { length: 0, start: () => 0, end: () => 0 },
    HAVE_METADATA: 1,
    HAVE_FUTURE_DATA: 3,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    play: vi.fn().mockResolvedValue(undefined),
    pause: vi.fn(),
    ...overrides,
  } as unknown as HTMLVideoElement
}

describe('useVideoPlayback seeking', () => {
  it('sets currentTime directly when no override is supplied', () => {
    const video = fakeVideo()
    const ref = { current: video }
    const { result } = renderHook(() => useVideoPlayback(ref))

    act(() => result.current.seek(42))
    expect(video.currentTime).toBe(42)
  })

  // With DASH the player owns the buffer: moving the element's playhead behind
  // its back leaves it buffering forever, which is what "stuck on Buffering"
  // after a seek turned out to be.
  it('delegates to the override instead of touching currentTime', () => {
    const video = fakeVideo()
    const ref = { current: video }
    const seekOverride = vi.fn()
    const { result } = renderHook(() => useVideoPlayback(ref, { seekOverride }))

    act(() => result.current.seek(42))
    expect(seekOverride).toHaveBeenCalledWith(42)
    expect(video.currentTime).toBe(0)
  })

  it('clamps a seek past the end before delegating', () => {
    const ref = { current: fakeVideo({ duration: 100 } as Partial<HTMLVideoElement>) }
    const seekOverride = vi.fn()
    const { result } = renderHook(() => useVideoPlayback(ref, { seekOverride }))

    act(() => result.current.seek(9999))
    expect(seekOverride).toHaveBeenCalledWith(100)
  })

  it('clamps a negative seek to zero', () => {
    const ref = { current: fakeVideo() }
    const seekOverride = vi.fn()
    const { result } = renderHook(() => useVideoPlayback(ref, { seekOverride }))

    act(() => result.current.seek(-30))
    expect(seekOverride).toHaveBeenCalledWith(0)
  })

  it('routes relative skips through the same path', () => {
    const ref = { current: fakeVideo({ currentTime: 50 } as Partial<HTMLVideoElement>) }
    const seekOverride = vi.fn()
    const { result } = renderHook(() => useVideoPlayback(ref, { seekOverride }))

    act(() => result.current.skip(10))
    expect(seekOverride).toHaveBeenCalledWith(60)
  })

  // The control bar and key handlers hold onto this callback.
  it('keeps the seek callback stable when the override changes', () => {
    const ref = { current: fakeVideo() }
    const { result, rerender } = renderHook(
      ({ fn }) => useVideoPlayback(ref, { seekOverride: fn }),
      { initialProps: { fn: vi.fn() } },
    )
    const first = result.current.seek

    const second = vi.fn()
    rerender({ fn: second })
    expect(result.current.seek).toBe(first)

    act(() => result.current.seek(10))
    expect(second).toHaveBeenCalledWith(10)
  })
})
