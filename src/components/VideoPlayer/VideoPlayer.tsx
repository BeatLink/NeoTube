import { useRef, useState } from 'react'
import type { StreamUrl } from '../../plugins/types'
import '../MenuButton/MenuButton.css'
import './VideoPlayer.css'

interface Props {
  streams: StreamUrl[]
  title: string
}

function bestStream(streams: StreamUrl[]): StreamUrl | undefined {
  // Prefer a stream with both video and audio at the highest quality
  const combined = streams.filter(s => s.hasVideo && s.hasAudio)
  if (combined.length > 0) return combined[0]
  // Fall back to highest-res video-only (user will have no audio — acceptable fallback)
  return streams[0]
}

export default function VideoPlayer({ streams, title }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [selected, setSelected] = useState<StreamUrl | undefined>(() => bestStream(streams))

  if (streams.length === 0) return <p className="player-error">No streams available.</p>

  return (
    <div className="video-player">
      <video
        ref={videoRef}
        src={selected?.url}
        controls
        autoPlay
        title={title}
        className="video-element"
      />
      <div className="quality-selector menu-btn-group">
        {streams.filter(s => s.hasVideo).map((s, i) => (
          <button
            key={`${s.quality}-${s.format}-${i}`}
            className={`menu-btn${selected === s ? ' menu-btn-active' : ''}`}
            onClick={() => setSelected(s)}
          >
            {s.quality}
          </button>
        ))}
      </div>
    </div>
  )
}
