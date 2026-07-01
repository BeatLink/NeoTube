import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { pluginManager } from '../plugins/manager'
import type { VideoInfo } from '../plugins/types'
import { isSubscribed, subscribe, unsubscribe } from '../db/index'
import VideoPlayer from '../components/VideoPlayer'
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
      // Fetch avatar in background and update the stored subscription
      pluginManager.getActive()
        .getChannelInfo(channelId)
        .then(info => { if (info.avatar) subscribe(channelId, channelName, info.avatar) })
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
          <button
            className={`watch-sub-btn ${subscribed ? 'subscribed' : ''}`}
            onClick={toggleSubscribe}
          >
            {subscribed ? 'Subscribed' : 'Subscribe'}
          </button>
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
