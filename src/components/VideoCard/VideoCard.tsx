import { Link } from 'react-router-dom'
import VideoThumbnail from '../VideoThumbnail'
import './VideoCard.css'

interface VideoCardProps {
  videoId: string
  title: string
  thumbnail?: string
  duration?: number
  channelId?: string
  channelName?: string
  dimmed?: boolean
  meta?: React.ReactNode
  onRemove?: () => void
  removeLabel?: string
}

export default function VideoCard({
  videoId, title, thumbnail, duration,
  channelId, channelName,
  dimmed, meta, onRemove, removeLabel,
}: VideoCardProps) {
  return (
    <li className={`video-card${dimmed ? ' video-card-dim' : ''}`}>
      <Link to={`/watch/${videoId}`} className="video-card-thumb-link">
        <VideoThumbnail src={thumbnail} duration={duration} />
      </Link>
      <div className="video-card-info">
        <Link to={`/watch/${videoId}`} className="video-card-title">{title}</Link>
        {channelId && channelName && (
          <Link to={`/channel/${channelId}`} className="video-card-channel">{channelName}</Link>
        )}
        {meta != null && <p className="video-card-meta">{meta}</p>}
      </div>
      {onRemove && (
        <button
          className="video-card-remove"
          onClick={onRemove}
          aria-label={removeLabel}
          title="Remove"
        >
          ✕
        </button>
      )}
    </li>
  )
}
