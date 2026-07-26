import { Link } from 'react-router-dom'
import VideoThumbnail from '../VideoThumbnail'
import VideoMenu, { type VideoMenuAction } from '../VideoMenu'
import { recordWatch } from '../../db/index'
import { openInBrowser } from '../../utils/tauri'
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
  /** Called after the video is marked watched, so lists can refresh. */
  onMarkWatched?: () => void
}

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

export default function VideoCard({
  videoId, title, thumbnail, duration,
  channelId, channelName,
  dimmed, meta, onRemove, removeLabel, onMarkWatched,
}: VideoCardProps) {
  const actions: VideoMenuAction[] = [
    {
      label: 'Mark as watched',
      confirmation: 'Marked as watched',
      onSelect: async () => {
        await recordWatch(
          videoId, title, channelId ?? '', channelName ?? '',
          thumbnail ?? '', duration ?? 0,
        )
        onMarkWatched?.()
      },
    },
    {
      label: 'Open in YouTube',
      onSelect: () => openInBrowser(watchUrl(videoId)),
    },
    {
      label: 'Copy link',
      confirmation: 'Link copied',
      onSelect: () => navigator.clipboard.writeText(watchUrl(videoId)),
    },
  ]

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
      {/* Shifted left when a remove button shares the corner. */}
      <VideoMenu
        actions={actions}
        label={`Options for ${title}`}
        offset={onRemove ? 32 : 4}
      />
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
