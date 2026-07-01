import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pluginManager } from '../plugins/manager'
import type { ChannelInfo } from '../plugins/types'
import { isSubscribed, subscribe, unsubscribe } from '../db/index'
import './Channel.css'

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; info: ChannelInfo }

export default function Channel() {
  const { channelId } = useParams<{ channelId: string }>()
  const [state, setState] = useState<State>({ status: 'loading' })
  const [subscribed, setSubscribed] = useState(false)

  useEffect(() => {
    if (!channelId) return
    setState({ status: 'loading' })
    let cancelled = false

    pluginManager
      .getActive()
      .getChannelInfo(channelId)
      .then(info => {
        if (cancelled) return
        setState({ status: 'ready', info })
        isSubscribed(channelId).then(setSubscribed)
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: 'error', message: err.message })
      })

    return () => { cancelled = true }
  }, [channelId])

  async function toggleSubscribe() {
    if (!channelId) return
    if (state.status === 'ready') {
      const { name, avatar } = state.info
      if (subscribed) {
        await unsubscribe(channelId)
        setSubscribed(false)
      } else {
        await subscribe(channelId, name, avatar)
        setSubscribed(true)
      }
    }
  }

  if (state.status === 'loading') return <div className="channel-status">Loading…</div>

  if (state.status === 'error') {
    return <div className="channel-status channel-error">{state.message}</div>
  }

  const { info } = state

  return (
    <div className="channel-page">
      <div className="channel-header">
        {info.avatar && (
          <img className="channel-avatar" src={info.avatar} alt={info.name} />
        )}
        <div className="channel-header-info">
          <h1 className="channel-name">{info.name}</h1>
          {info.subscriberCount !== undefined && (
            <p className="channel-subs">{info.subscriberCount.toLocaleString()} subscribers</p>
          )}
          <button
            className={`channel-sub-btn ${subscribed ? 'subscribed' : ''}`}
            onClick={toggleSubscribe}
          >
            {subscribed ? 'Subscribed' : 'Subscribe'}
          </button>
        </div>
      </div>

      {info.description && (
        <details className="channel-description">
          <summary>About</summary>
          <p>{info.description}</p>
        </details>
      )}
    </div>
  )
}
