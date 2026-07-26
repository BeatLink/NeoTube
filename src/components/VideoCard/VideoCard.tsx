import { useState } from 'react'
import { Link } from 'react-router-dom'
import VideoThumbnail from '../VideoThumbnail'
import VideoMenu, { type VideoMenuAction } from '../VideoMenu'
import PlaylistPicker from '../PlaylistPicker'
import { recordWatch } from '../../db/index'
import { formatViews, timeAgo } from '../../utils/format'
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
  /** Overrides the default views/upload-date line. */
  meta?: React.ReactNode
  viewCount?: number
  publishedAt?: string
  /** Pre-formatted by YouTube, e.g. "1.4M views" / "2 weeks ago". */
  viewCountText?: string
  publishedText?: string
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
  dimmed, meta, viewCount, publishedAt, viewCountText, publishedText,
  onRemove, removeLabel, onMarkWatched,
}: VideoCardProps) {
  const [pickerOpen, setPickerOpen] = useState(false)

  // YouTube's listing APIs return these already humanized ("1.4M views",
  // "2 weeks ago"); fall back to formatting raw values when they don't.
  const views = viewCountText
    ?? (viewCount !== undefined ? formatViews(viewCount) : undefined)
  const uploaded = publishedText
    ?? (publishedAt ? timeAgo(publishedAt) : undefined)
  const stats = [views, uploaded].filter(Boolean)
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
    {
      label: 'Add to playlist',
      onSelect: () => setPickerOpen(true),
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
        {meta != null
          ? <p className="video-card-meta">{meta}</p>
          : stats.length > 0 && (
              <p className="video-card-meta">{stats.join(' · ')}</p>
            )}
      </div>
      {/* Shifted left when a remove button shares the corner. */}
      <VideoMenu
        actions={actions}
        label={`Options for ${title}`}
        offset={onRemove ? 32 : 4}
      />
      {pickerOpen && (
        <PlaylistPicker
          video={{
            videoId,
            title,
            channelId: channelId ?? '',
            channelName: channelName ?? '',
            thumbnail: thumbnail ?? '',
            duration: duration ?? 0,
            viewCountText,
            publishedText,
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
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
