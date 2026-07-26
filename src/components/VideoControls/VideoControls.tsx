import { useEffect, useRef, useState } from 'react'
import type { PlaybackState } from '../../hooks/useVideoPlayback'
import './VideoControls.css'

export interface QualityOption {
  id: string
  label: string
}

interface VideoControlsProps {
  state: PlaybackState
  qualities: QualityOption[]
  selectedQuality: string
  fullscreen: boolean
  onTogglePlay: () => void
  onSeek: (time: number) => void
  onSetVolume: (volume: number) => void
  onToggleMute: () => void
  onSetRate: (rate: number) => void
  onSelectQuality: (id: string) => void
  onToggleFullscreen: () => void
}

const RATES = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2]

/** mm:ss, or h:mm:ss past an hour. */
export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00'
  const total = Math.floor(seconds)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  const s = total % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function VideoControls({
  state, qualities, selectedQuality, fullscreen,
  onTogglePlay, onSeek, onSetVolume, onToggleMute, onSetRate,
  onSelectQuality, onToggleFullscreen,
}: VideoControlsProps) {
  const [menu, setMenu] = useState<'none' | 'rate' | 'quality'>('none')
  // While dragging, the bar follows the pointer rather than the element, so it
  // doesn't jump back on each timeupdate before the seek lands.
  const [scrubTime, setScrubTime] = useState<number | null>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (menu === 'none') return
    const onPointerDown = (e: PointerEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenu('none')
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [menu])

  const shown = scrubTime ?? state.currentTime
  const progress = state.duration > 0 ? (shown / state.duration) * 100 : 0
  const bufferedPct = state.duration > 0 ? (state.buffered / state.duration) * 100 : 0

  return (
    <div className="vc" onClick={e => e.stopPropagation()}>
      <input
        type="range"
        className="vc-seek"
        min={0}
        max={state.duration || 0}
        step="any"
        value={shown}
        // Track the drag locally, commit on release.
        onChange={e => setScrubTime(Number(e.target.value))}
        onPointerUp={() => { if (scrubTime !== null) { onSeek(scrubTime); setScrubTime(null) } }}
        onKeyUp={() => { if (scrubTime !== null) { onSeek(scrubTime); setScrubTime(null) } }}
        aria-label="Seek"
        style={{
          '--vc-progress': `${progress}%`,
          '--vc-buffered': `${bufferedPct}%`,
        } as React.CSSProperties}
      />

      <div className="vc-row">
        <button
          className="vc-btn"
          onClick={onTogglePlay}
          aria-label={state.playing ? 'Pause' : 'Play'}
          title={state.playing ? 'Pause (k)' : 'Play (k)'}
        >
          {state.playing ? <PauseIcon /> : <PlayIcon />}
        </button>

        <div className="vc-volume">
          <button
            className="vc-btn"
            onClick={onToggleMute}
            aria-label={state.muted ? 'Unmute' : 'Mute'}
            title={state.muted ? 'Unmute (m)' : 'Mute (m)'}
          >
            {state.muted || state.volume === 0 ? <MutedIcon /> : <VolumeIcon />}
          </button>
          <input
            type="range"
            className="vc-volume-slider"
            min={0}
            max={1}
            step={0.05}
            value={state.muted ? 0 : state.volume}
            onChange={e => onSetVolume(Number(e.target.value))}
            aria-label="Volume"
          />
        </div>

        <span className="vc-time">
          {formatTime(shown)} / {formatTime(state.duration)}
        </span>

        <div className="vc-spacer" />

        <div className="vc-menus" ref={menuRef}>
          <div className="vc-menu-wrap">
            <button
              className="vc-btn vc-btn-text"
              onClick={() => setMenu(m => (m === 'rate' ? 'none' : 'rate'))}
              aria-label="Playback speed"
              aria-expanded={menu === 'rate'}
              title="Playback speed"
            >
              {state.rate}×
            </button>
            {menu === 'rate' && (
              <ul className="vc-menu" role="menu">
                {RATES.map(rate => (
                  <li key={rate}>
                    <button
                      role="menuitem"
                      className={`vc-menu-item${state.rate === rate ? ' active' : ''}`}
                      onClick={() => { onSetRate(rate); setMenu('none') }}
                    >
                      {rate === 1 ? 'Normal' : `${rate}×`}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {qualities.length > 0 && (
            <div className="vc-menu-wrap">
              <button
                className="vc-btn vc-btn-text"
                onClick={() => setMenu(m => (m === 'quality' ? 'none' : 'quality'))}
                aria-label="Quality"
                aria-expanded={menu === 'quality'}
                title="Quality"
              >
                {qualities.find(q => q.id === selectedQuality)?.label ?? 'Auto'}
              </button>
              {menu === 'quality' && (
                <ul className="vc-menu" role="menu">
                  {qualities.map(q => (
                    <li key={q.id}>
                      <button
                        role="menuitem"
                        className={`vc-menu-item${selectedQuality === q.id ? ' active' : ''}`}
                        onClick={() => { onSelectQuality(q.id); setMenu('none') }}
                      >
                        {q.label}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          <button
            className="vc-btn"
            onClick={onToggleFullscreen}
            aria-label={fullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            title={fullscreen ? 'Exit fullscreen (f)' : 'Fullscreen (f)'}
          >
            {fullscreen ? <ExitFullscreenIcon /> : <FullscreenIcon />}
          </button>
        </div>
      </div>
    </div>
  )
}

// ─── Icons ────────────────────────────────────────────────────────────────────

const icon = (path: React.ReactNode) => (
  <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="currentColor">
    {path}
  </svg>
)

const PlayIcon = () => icon(<path d="M8 5v14l11-7z" />)
const PauseIcon = () => icon(<path d="M6 5h4v14H6zm8 0h4v14h-4z" />)
const VolumeIcon = () => icon(
  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3a4.5 4.5 0 0 0-2.5-4v8a4.5 4.5 0 0 0 2.5-4z" />,
)
const MutedIcon = () => icon(
  <path d="M3 9v6h4l5 5V4L7 9H3zm13.6 3 2.4-2.4-1.2-1.2-2.4 2.4-2.4-2.4-1.2 1.2 2.4 2.4-2.4 2.4 1.2 1.2 2.4-2.4 2.4 2.4 1.2-1.2z" />,
)
const FullscreenIcon = () => icon(
  <path d="M3 3h5v2H5v3H3V3zm13 0h5v5h-2V5h-3V3zM5 16v3h3v2H3v-5h2zm14 0h2v5h-5v-2h3v-3z" />,
)
const ExitFullscreenIcon = () => icon(
  <path d="M8 8H3V6h3V3h2v5zm8 0V3h2v3h3v2h-5zm0 8h5v2h-3v3h-2v-5zM8 16v5H6v-3H3v-2h5z" />,
)
