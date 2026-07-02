import { formatDuration } from '../../utils/format'
import './VideoThumbnail.css'

interface VideoThumbnailProps {
  src?: string
  duration?: number
  alt?: string
}

export default function VideoThumbnail({ src, duration, alt = '' }: VideoThumbnailProps) {
  return (
    <div className="video-thumb">
      {src
        ? <img className="video-thumb-img" src={src} alt={alt} loading="lazy" />
        : <div className="video-thumb-blank" />
      }
      {duration != null && duration > 0 && (
        <span className="video-thumb-duration">{formatDuration(duration)}</span>
      )}
    </div>
  )
}
