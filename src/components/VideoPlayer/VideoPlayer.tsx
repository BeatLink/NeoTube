import { useCallback, useEffect, useRef, useState } from 'react'
import type { MediaPlayerClass } from 'dashjs'
import type { StreamUrl } from '../../plugins/types'
import { useVideoPlayback } from '../../hooks/useVideoPlayback'
import VideoControls from '../VideoControls'
import './VideoPlayer.css'

interface Props {
  /** Progressive (muxed) streams — the fallback when DASH is unavailable. */
  streams: StreamUrl[]
  /** DASH manifest from youtubei.js; null outside Tauri. */
  manifest?: string | null
  title: string
  /** Receives a getter for the playhead, for things like timed share links. */
  onReady?: (getCurrentTime: () => number) => void
}

const AUTO = 'auto'

/**
 * dash.js error codes that do not mean playback has failed.
 *
 * Segment and manifest fetches are retried internally, so these fire routinely
 * during normal playback — most often when a request through the `ytstream://`
 * proxy blips. Treating them as fatal would drop an otherwise healthy 1080p
 * stream down to progressive 360p mid-video.
 */
export const RECOVERABLE_DASH_ERRORS = new Set([
  17, // FRAGMENT_LOADER_LOADING_FAILURE
  18, // FRAGMENT_LOADER_NULL_REQUEST
  25, // DOWNLOAD_ERROR_ID_MANIFEST
  26, // DOWNLOAD_ERROR_ID_SIDX
  27, // DOWNLOAD_ERROR_ID_CONTENT
  28, // DOWNLOAD_ERROR_ID_INITIALIZATION
  29, // DOWNLOAD_ERROR_ID_XLINK
])

/** A selectable video quality. `id` is a dash.js representation id, or AUTO. */
interface QualityOption {
  id: string
  label: string
}

/**
 * Collapses dash.js representations into one entry per resolution.
 *
 * YouTube publishes every height in several codecs (typically vp9, av01 and
 * avc1), so the raw list shows "1080p" two or three times. Where a height is
 * available in more than one codec we keep the H.264 (`avc1`) rendition, which
 * has the widest hardware-decode support.
 */
export function toQualityOptions(
  representations: Array<{ id: string; height?: number | null; codecs?: string | null }>,
): QualityOption[] {
  const byHeight = new Map<number, { id: string; codecs: string }>()

  for (const rep of representations) {
    if (!rep.height) continue
    const codecs = rep.codecs ?? ''
    const existing = byHeight.get(rep.height)
    // First one wins, unless a later one is H.264 and the incumbent isn't.
    if (!existing || (codecs.startsWith('avc1') && !existing.codecs.startsWith('avc1'))) {
      byHeight.set(rep.height, { id: rep.id, codecs })
    }
  }

  return [...byHeight.entries()]
    .sort(([a], [b]) => b - a)
    .map(([height, { id }]) => ({ id, label: `${height}p` }))
}

function bestProgressive(streams: StreamUrl[]): StreamUrl | undefined {
  // Prefer a stream with both video and audio at the highest quality
  const combined = streams.filter(s => s.hasVideo && s.hasAudio)
  if (combined.length > 0) return combined[0]
  // Fall back to highest-res video-only (user will have no audio — acceptable fallback)
  return streams[0]
}

/**
 * Plays a video, preferring adaptive DASH so quality is not capped at 360p —
 * YouTube stops muxing video+audio above that, so everything higher arrives as
 * separate streams that only MSE can combine.
 *
 * Falls back to progressive playback in the browser, or if dash.js errors.
 */
export default function VideoPlayer({ streams, manifest, title, onReady }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<MediaPlayerClass | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [qualities, setQualities] = useState<QualityOption[]>([])
  const [selectedQuality, setSelectedQuality] = useState<string>(AUTO)
  const [dashFailed, setDashFailed] = useState(false)
  const [pointerActive, setPointerActive] = useState(false)
  const idleTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const playback = useVideoPlayback(videoRef)
  const [progressive, setProgressive] = useState<StreamUrl | undefined>(
    () => bestProgressive(streams),
  )

  const useDash = !!manifest && !dashFailed

  useEffect(() => {
    if (!useDash) setProgressive(bestProgressive(streams))
  }, [streams, useDash])

  useEffect(() => {
    onReady?.(() => videoRef.current?.currentTime ?? 0)
  }, [onReady])

  /** Reveals the controls, then hides them again after a moment of stillness. */
  const notePointerActivity = useCallback(() => {
    setPointerActive(true)
    if (idleTimer.current) clearTimeout(idleTimer.current)
    idleTimer.current = setTimeout(() => setPointerActive(false), 2500)
  }, [])

  useEffect(() => () => { if (idleTimer.current) clearTimeout(idleTimer.current) }, [])

  /** Standard player shortcuts, matching what YouTube uses. */
  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    // Don't hijack typing in the quality/speed menus or elsewhere.
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return

    const handlers: Record<string, () => void> = {
      ' ': playback.togglePlay,
      k: playback.togglePlay,
      ArrowLeft: () => playback.skip(-5),
      ArrowRight: () => playback.skip(5),
      j: () => playback.skip(-10),
      l: () => playback.skip(10),
      ArrowUp: () => playback.setVolume(playback.state.volume + 0.05),
      ArrowDown: () => playback.setVolume(playback.state.volume - 0.05),
      m: playback.toggleMute,
      f: () => { void toggleFullscreen() },
      Home: () => playback.seek(0),
      End: () => playback.seek(playback.state.duration),
    }

    const handler = handlers[e.key]
    if (handler) {
      e.preventDefault()
      handler()
      notePointerActivity()
    }
  }, [playback, notePointerActivity])

  // Track fullscreen externally too — Escape and F11 bypass our button.
  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (dashFailed || !manifest) return
    const video = videoRef.current
    if (!video) return

    let cancelled = false
    let player: MediaPlayerClass | null = null

    // dash.js is large; only pull it in when a manifest is actually played.
    import('dashjs')
      .then(({ MediaPlayer }) => {
        if (cancelled || !videoRef.current) return

        player = MediaPlayer().create()
        playerRef.current = player

        player.on('streamInitialized', () => {
          if (cancelled || !player) return
          setQualities([
            { id: AUTO, label: 'Auto' },
            ...toQualityOptions(player.getRepresentationsByType('video')),
          ])
        })

        player.on('error', (e: unknown) => {
          if (cancelled) return
          const code = (e as { error?: { code?: number } })?.error?.code
          // dash.js retries transient segment and manifest fetches itself, and
          // a single failed request is routine on a long video. Only give up
          // when the stream genuinely cannot play — otherwise a blip would
          // silently drop the whole session to progressive 360p.
          if (code !== undefined && RECOVERABLE_DASH_ERRORS.has(code)) return
          setDashFailed(true)
        })

        // The manifest is already in memory, so hand it over directly rather
        // than having dash.js re-fetch something generated locally.
        const source = URL.createObjectURL(
          new Blob([manifest], { type: 'application/dash+xml' }),
        )
        player.initialize(videoRef.current, source, true)
      })
      .catch(() => {
        if (!cancelled) setDashFailed(true)
      })

    return () => {
      cancelled = true
      player?.destroy()
      playerRef.current = null
    }
  }, [manifest, dashFailed])

  const progressiveQualities = streams
    .filter(s => s.hasVideo)
    .map(s => ({ id: s.url, label: s.quality }))

  function handleQualityChange(id: string) {
    setSelectedQuality(id)
    const player = playerRef.current
    if (!player) return

    // Pinning a representation means turning off adaptive switching, or ABR
    // would immediately override the choice.
    const autoSwitch = id === AUTO
    player.updateSettings({
      streaming: { abr: { autoSwitchBitrate: { video: autoSwitch } } },
    })
    if (!autoSwitch) player.setRepresentationForTypeById('video', id, true)
  }

  async function toggleFullscreen() {
    // Fullscreen the container, not the <video>, so our own controls stay
    // visible — a natively fullscreened video hides sibling elements.
    const container = containerRef.current
    if (!container) return
    try {
      if (document.fullscreenElement) await document.exitFullscreen()
      else await container.requestFullscreen()
    } catch { /* denied or unsupported */ }
  }

  if (!useDash && streams.length === 0) {
    return <p className="player-error">No streams available.</p>
  }

  // Controls stay up while paused so they don't vanish mid-decision.
  const controlsPinned = !playback.state.playing

  return (
    <div
      className={[
        'video-player',
        isFullscreen ? ' video-player-fullscreen' : '',
        controlsPinned || pointerActive ? ' video-player-active' : '',
      ].join('')}
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onPointerMove={notePointerActivity}
      onPointerLeave={() => setPointerActive(false)}
      aria-label={`Video player: ${title}`}
    >
      <video
        ref={videoRef}
        src={useDash ? undefined : progressive?.url}
        autoPlay
        title={title}
        className="video-element"
        onClick={playback.togglePlay}
        onDoubleClick={toggleFullscreen}
      />

      {playback.state.stalled && <div className="video-spinner" aria-label="Buffering" />}

      <VideoControls
        state={playback.state}
        qualities={useDash ? qualities : progressiveQualities}
        selectedQuality={useDash ? selectedQuality : (progressive?.url ?? '')}
        fullscreen={isFullscreen}
        onTogglePlay={playback.togglePlay}
        onSeek={playback.seek}
        onSetVolume={playback.setVolume}
        onToggleMute={playback.toggleMute}
        onSetRate={playback.setRate}
        onSelectQuality={useDash
          ? handleQualityChange
          : url => setProgressive(streams.find(s => s.url === url))}
        onToggleFullscreen={toggleFullscreen}
      />
    </div>
  )
}
