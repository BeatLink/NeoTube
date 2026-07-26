import { useCallback, useEffect, useRef, useState } from 'react'

/** Mirrors the parts of a media element the control bar needs to render. */
export interface PlaybackState {
  playing: boolean
  currentTime: number
  duration: number
  /** Seconds buffered ahead of the playhead. */
  buffered: number
  volume: number
  muted: boolean
  rate: number
  /** True while the element is waiting on data. */
  stalled: boolean
  /**
   * How far the element has got towards being playable, mirroring
   * HTMLMediaElement.readyState. Distinguishes "still fetching metadata" from
   * "have metadata but no frames" — the difference between a slow start and a
   * stream that will never play.
   */
  readyState: number
  /** True once metadata has arrived, so duration and tracks are known. */
  hasMetadata: boolean
}

const INITIAL: PlaybackState = {
  playing: false,
  currentTime: 0,
  duration: 0,
  buffered: 0,
  volume: 1,
  muted: false,
  rate: 1,
  stalled: false,
  readyState: 0,
  hasMetadata: false,
}

const VOLUME_KEY = 'player-volume'

/**
 * Tracks a `<video>` element's playback state and exposes commands for it.
 *
 * Everything here mirrors the element rather than owning the truth: the element
 * is still the source of state, so external changes (dash.js seeking, the media
 * keys, autoplay policies) stay in sync instead of drifting from the UI.
 */
export function useVideoPlayback(videoRef: React.RefObject<HTMLVideoElement | null>) {
  const [state, setState] = useState<PlaybackState>(INITIAL)
  // Kept in a ref so the event listeners never need re-binding.
  const stateRef = useRef(state)
  stateRef.current = state

  useEffect(() => {
    const video = videoRef.current
    if (!video) return

    // Volume is a preference, not per-video state.
    const stored = Number(localStorage.getItem(VOLUME_KEY))
    if (Number.isFinite(stored) && stored >= 0 && stored <= 1) video.volume = stored

    const bufferedAhead = () => {
      const ranges = video.buffered
      for (let i = 0; i < ranges.length; i++) {
        if (ranges.start(i) <= video.currentTime && video.currentTime <= ranges.end(i)) {
          return ranges.end(i)
        }
      }
      return 0
    }

    const sync = () => setState({
      playing: !video.paused && !video.ended,
      currentTime: video.currentTime,
      // Live streams report Infinity, which no progress bar can use.
      duration: Number.isFinite(video.duration) ? video.duration : 0,
      buffered: bufferedAhead(),
      volume: video.volume,
      muted: video.muted,
      rate: video.playbackRate,
      stalled: video.readyState < video.HAVE_FUTURE_DATA && !video.paused,
      readyState: video.readyState,
      hasMetadata: video.readyState >= video.HAVE_METADATA,
    })

    const events = [
      'play', 'pause', 'timeupdate', 'durationchange', 'progress',
      'volumechange', 'ratechange', 'waiting', 'playing', 'ended', 'seeked',
      'loadedmetadata', 'canplay',
    ]
    for (const event of events) video.addEventListener(event, sync)
    sync()

    return () => { for (const event of events) video.removeEventListener(event, sync) }
  }, [videoRef])

  const play = useCallback(() => { void videoRef.current?.play().catch(() => {}) }, [videoRef])
  const pause = useCallback(() => videoRef.current?.pause(), [videoRef])

  const togglePlay = useCallback(() => {
    const video = videoRef.current
    if (!video) return
    if (video.paused || video.ended) void video.play().catch(() => {})
    else video.pause()
  }, [videoRef])

  const seek = useCallback((time: number) => {
    const video = videoRef.current
    if (!video) return
    const max = Number.isFinite(video.duration) ? video.duration : time
    video.currentTime = Math.max(0, Math.min(time, max))
  }, [videoRef])

  const skip = useCallback((delta: number) => {
    const video = videoRef.current
    if (video) seek(video.currentTime + delta)
  }, [videoRef, seek])

  const setVolume = useCallback((volume: number) => {
    const video = videoRef.current
    if (!video) return
    const clamped = Math.max(0, Math.min(volume, 1))
    video.volume = clamped
    // Raising the volume from a muted state should also unmute.
    if (clamped > 0 && video.muted) video.muted = false
    localStorage.setItem(VOLUME_KEY, String(clamped))
  }, [videoRef])

  const toggleMute = useCallback(() => {
    const video = videoRef.current
    if (video) video.muted = !video.muted
  }, [videoRef])

  const setRate = useCallback((rate: number) => {
    const video = videoRef.current
    if (video) video.playbackRate = rate
  }, [videoRef])

  return { state, play, pause, togglePlay, seek, skip, setVolume, toggleMute, setRate }
}
