import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pluginManager } from '../plugins/manager'
import type { VideoInfo } from '../plugins/types'
import VideoPlayer from '../components/VideoPlayer'
import './Watch.css'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; info: VideoInfo }

export default function Watch() {
  const { videoId } = useParams<{ videoId: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })

  useEffect(() => {
    if (!videoId) return
    setState({ status: 'loading' })

    let cancelled = false
    pluginManager
      .getActive()
      .getVideoInfo(videoId)
      .then(info => { if (!cancelled) setState({ status: 'ready', info }) })
      .catch((err: Error) => { if (!cancelled) setState({ status: 'error', message: err.message }) })

    return () => { cancelled = true }
  }, [videoId])

  if (state.status === 'loading') return <div className="watch-status">Loading…</div>
  if (state.status === 'error') return <div className="watch-status watch-error">{state.message}</div>

  const { info } = state

  return (
    <div className="watch-page">
      <VideoPlayer streams={info.streams} title={info.title} />
      <div className="watch-meta">
        <h1 className="watch-title">{info.title}</h1>
        <p className="watch-channel">{info.channelName}</p>
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
