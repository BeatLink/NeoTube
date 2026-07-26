import { useEffect, useRef, useState } from 'react'
import type { MediaPlayerClass } from 'dashjs'
import type { StreamUrl } from '../../plugins/types'
import './VideoPlayer.css'

interface Props {
  /** Progressive (muxed) streams — the fallback when DASH is unavailable. */
  streams: StreamUrl[]
  /** DASH manifest from youtubei.js; null outside Tauri. */
  manifest?: string | null
  title: string
}

const AUTO = 'auto'

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
export default function VideoPlayer({ streams, manifest, title }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const playerRef = useRef<MediaPlayerClass | null>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)

  const [qualities, setQualities] = useState<QualityOption[]>([])
  const [selectedQuality, setSelectedQuality] = useState<string>(AUTO)
  const [dashFailed, setDashFailed] = useState(false)
  const [progressive, setProgressive] = useState<StreamUrl | undefined>(
    () => bestProgressive(streams),
  )

  const useDash = !!manifest && !dashFailed

  useEffect(() => {
    if (!useDash) setProgressive(bestProgressive(streams))
  }, [streams, useDash])

  // Track fullscreen externally too — Escape and F11 bypass our button.
  useEffect(() => {
    const onChange = () =>
      setIsFullscreen(document.fullscreenElement === containerRef.current)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  useEffect(() => {
    if (!useDash || !manifest) return
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

        player.on('error', () => {
          if (!cancelled) setDashFailed(true)
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
  }, [manifest, useDash])

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
    // Fullscreen the container, not the <video>, so the quality dropdown stays
    // reachable — a natively fullscreened video hides sibling elements.
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

  return (
    <div
      className={`video-player${isFullscreen ? ' video-player-fullscreen' : ''}`}
      ref={containerRef}
    >
      <video
        ref={videoRef}
        src={useDash ? undefined : progressive?.url}
        controls
        autoPlay
        title={title}
        className="video-element"
        onDoubleClick={toggleFullscreen}
      />

      {/* Overlaid on the video rather than injected into the native control
          bar, which lives in the browser's shadow DOM and can't be extended. */}
      <div className="player-controls">
        <label className="quality-label" htmlFor="quality-select">Quality</label>
        {useDash ? (
          <select
            id="quality-select"
            className="quality-select"
            value={selectedQuality}
            onChange={e => handleQualityChange(e.target.value)}
            disabled={qualities.length === 0}
          >
            {qualities.length === 0
              ? <option value={AUTO}>Loading…</option>
              : qualities.map(q => <option key={q.id} value={q.id}>{q.label}</option>)}
          </select>
        ) : (
          <select
            id="quality-select"
            className="quality-select"
            value={progressive?.url ?? ''}
            onChange={e => setProgressive(streams.find(s => s.url === e.target.value))}
          >
            {streams.filter(s => s.hasVideo).map((s, i) => (
              <option key={`${s.quality}-${s.format}-${i}`} value={s.url}>{s.quality}</option>
            ))}
          </select>
        )}

        <button
          type="button"
          className="fullscreen-btn"
          onClick={toggleFullscreen}
          aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
          title={isFullscreen ? 'Exit fullscreen' : 'Fullscreen'}
        >
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true">
            {isFullscreen ? (
              <path
                fill="currentColor"
                d="M8 8H3V6h3V3h2v5zm8 0V3h2v3h3v2h-5zm0 8h5v2h-3v3h-2v-5zM8 16v5H6v-3H3v-2h5z"
              />
            ) : (
              <path
                fill="currentColor"
                d="M3 3h5v2H5v3H3V3zm13 0h5v5h-2V5h-3V3zM5 16v3h3v2H3v-5h2zm14 0h2v5h-5v-2h3v-3z"
              />
            )}
          </svg>
        </button>
      </div>
    </div>
  )
}
