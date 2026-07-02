import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { pluginManager } from '../plugins/manager'
import type { VideoInfo } from '../plugins/types'
import { isSubscribed, subscribe, unsubscribe, recordWatch } from '../db/index'
import { downloadAvatar } from '../utils/avatar'
import VideoPlayer from '../components/VideoPlayer'
import Button from '../components/Button'
import './Watch.css'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; info: VideoInfo }

export default function Watch() {
  const { videoId } = useParams<{ videoId: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [subscribed, setSubscribed] = useState(false)

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
        // Download thumbnail blob before saving so history entries are self-contained
        ;(async () => {
          const blob = await downloadAvatar(info.thumbnail)
          recordWatch(info.videoId, info.title, info.channelId, info.channelName, blob ?? info.thumbnail, info.duration)
            .catch(() => {})
        })()
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
      <VideoPlayer streams={info.streams} title={info.title} />
      <div className="watch-meta">
        <h1 className="watch-title">{info.title}</h1>
        <div className="watch-channel-row">
          <Link to={`/channel/${info.channelId}`} className="watch-channel">
            {info.channelName}
          </Link>
          <Button
            className={`watch-sub-btn${subscribed ? ' subscribed' : ''}`}
            onClick={toggleSubscribe}
          >
            {subscribed ? 'Subscribed' : 'Subscribe'}
          </Button>
        </div>
        {info.viewCount !== undefined && (
          <p className="watch-views">{info.viewCount.toLocaleString()} views</p>
        )}
        {info.description && (
          <details className="watch-description">
            <summary>Description</summary>
            <p>{info.description}</p>
          </details>
        )}
      </div>
    </div>
  )
}
