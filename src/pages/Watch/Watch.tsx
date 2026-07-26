import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { pluginManager } from '../../plugins/manager'
import type { VideoInfo } from '../../plugins/types'
import { isSubscribed, subscribe, unsubscribe, recordWatch } from '../../db/index'
import { downloadAvatar, thumbnailUrl } from '../../utils/avatar'
import VideoPlayer from '../../components/VideoPlayer'
import Comments from '../../components/Comments'
import PlaylistPicker from '../../components/PlaylistPicker'
import { formatViews } from '../../utils/format'
import VideoMenu from '../../components/VideoMenu'
import { openInBrowser } from '../../utils/tauri'
import Button from '../../components/Button'
import './Watch.css'

function watchUrl(videoId: string): string {
  return `https://www.youtube.com/watch?v=${videoId}`
}

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; info: VideoInfo }

export default function Watch() {
  const { videoId } = useParams<{ videoId: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [subscribed, setSubscribed] = useState(false)
  const [pickerOpen, setPickerOpen] = useState(false)
  // Set by the player; lets "copy link at current time" read the playhead.
  const getCurrentTime = useRef<() => number>(() => 0)
  // Declared here, not inline in the JSX: this component returns early while
  // loading, and a hook below that point would change hook order between
  // renders.
  const handlePlayerReady = useCallback((fn: () => number) => {
    getCurrentTime.current = fn
  }, [])
  // Fetched alongside the video info so the page renders without waiting on it.
  // null means adaptive playback is unavailable and the player uses `streams`.
  const [manifest, setManifest] = useState<string | null>(null)

  useEffect(() => {
    if (!videoId) return
    setManifest(null)
    let cancelled = false

    const plugin = pluginManager.getActive()
    plugin.getDashManifest?.(videoId)
      .then(mpd => { if (!cancelled) setManifest(mpd) })
      .catch(() => { /* fall back to progressive streams */ })

    return () => { cancelled = true }
  }, [videoId])

  useEffect(() => {
    if (!videoId) return
    setState({ status: 'loading' })
    let cancelled = false

    pluginManager
      .getActive()
      .getVideoInfo(videoId)
      .then(info => {
        if (cancelled) return
        setState({ status: 'ready', info })
        isSubscribed(info.channelId).then(setSubscribed)
        // The thumbnail is stored as a URL; <img loading="lazy"> fetches it when
        // the entry actually scrolls into view on the History page.
        recordWatch(
          info.videoId, info.title, info.channelId, info.channelName,
          thumbnailUrl(info.thumbnail, info.videoId), info.duration,
        ).catch(() => {})
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: 'error', message: err.message })
      })

    return () => { cancelled = true }
  }, [videoId])

  async function toggleSubscribe() {
    if (state.status !== 'ready') return
    const { channelId, channelName } = state.info
    if (subscribed) {
      await unsubscribe(channelId)
      setSubscribed(false)
    } else {
      await subscribe(channelId, channelName)
      setSubscribed(true)
      // Fetch avatar in background, download to blob, then update stored subscription
      pluginManager.getActive()
        .getChannelInfo(channelId)
        .then(async info => {
          if (info.avatar) {
            const blob = await downloadAvatar(info.avatar)
            if (blob) subscribe(channelId, channelName, blob)
          }
        })
        .catch(() => {})
    }
  }

  if (state.status === 'loading') return <div className="watch-status">Loading…</div>
  if (state.status === 'error') return <div className="watch-status watch-error">{state.message}</div>

  const { info } = state

  return (
    <div className="watch-page">
      <VideoPlayer
        streams={info.streams}
        manifest={manifest}
        title={info.title}
        onReady={handlePlayerReady}
      />
      <div className="watch-meta">
        <h1 className="watch-title">{info.title}</h1>

        <div className="watch-channel-row">
          <Link to={`/channel/${info.channelId}`} className="watch-channel-link">
            {info.channelAvatar
              ? <img className="watch-channel-avatar" src={info.channelAvatar} alt="" loading="lazy" />
              : <div className="watch-channel-avatar watch-channel-avatar-initial" aria-hidden="true">
                  {info.channelName.charAt(0).toUpperCase()}
                </div>
            }
            <span className="watch-channel">{info.channelName}</span>
          </Link>
          <Button
            className={`watch-sub-btn${subscribed ? ' subscribed' : ''}`}
            onClick={toggleSubscribe}
          >
            {subscribed ? 'Subscribed' : 'Subscribe'}
          </Button>

          <div className="watch-actions">
            {info.likeCount !== undefined && (
              <span className="watch-stat" title={`${info.likeCount.toLocaleString()} likes`}>
                👍 {formatViews(info.likeCount).replace(/ views?$/, '')}
              </span>
            )}
            <Button onClick={() => setPickerOpen(true)}>Add to playlist</Button>
            <div className="watch-menu">
              <VideoMenu
                label="Video options"
                actions={[
                  {
                    label: 'Open in YouTube',
                    onSelect: () => openInBrowser(watchUrl(info.videoId)),
                  },
                  {
                    label: 'Copy link',
                    confirmation: 'Link copied',
                    onSelect: () => navigator.clipboard.writeText(watchUrl(info.videoId)),
                  },
                  {
                    label: 'Copy link at current time',
                    confirmation: 'Link copied',
                    onSelect: () => {
                      const at = Math.floor(getCurrentTime.current())
                      return navigator.clipboard.writeText(
                        `${watchUrl(info.videoId)}&t=${at}`,
                      )
                    },
                  },
                  {
                    label: 'Open channel in YouTube',
                    onSelect: () => openInBrowser(
                      `https://www.youtube.com/channel/${info.channelId}`,
                    ),
                  },
                ]}
              />
            </div>
          </div>
        </div>

        {(() => {
          const stats = [
            info.viewCount !== undefined ? `${info.viewCount.toLocaleString()} views` : null,
            info.publishedText,
            info.publishedRelative && info.publishedText !== info.publishedRelative
              ? info.publishedRelative
              : null,
          ].filter(Boolean)
          return stats.length > 0 && <p className="watch-stats">{stats.join(' · ')}</p>
        })()}

        {info.description && (
          <details className="watch-description">
            <summary>Description</summary>
            <p>{info.description}</p>
          </details>
        )}
      </div>

      <Comments videoId={info.videoId} />

      {pickerOpen && (
        <PlaylistPicker
          video={{
            videoId: info.videoId,
            title: info.title,
            channelId: info.channelId,
            channelName: info.channelName,
            thumbnail: info.thumbnail,
            duration: info.duration,
          }}
          onClose={() => setPickerOpen(false)}
        />
      )}
    </div>
  )
}
