import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSubscriptions, unsubscribe } from '../db/index'
import type { Subscription } from '../types'
import './Subscriptions.css'

export default function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    getSubscriptions()
      .then(setSubs)
      .finally(() => setLoading(false))
  }, [])

  async function handleUnsubscribe(channelId: string) {
    await unsubscribe(channelId)
    setSubs(prev => prev.filter(s => s.channelId !== channelId))
  }

  if (loading) return <p className="subs-status">Loading…</p>

  return (
    <div className="subs-page">
      <h1 className="subs-heading">Subscriptions</h1>

      {subs.length === 0 ? (
        <p className="subs-empty">
          You haven't subscribed to any channels yet. Subscribe from a video's watch page.
        </p>
      ) : (
        <ul className="subs-list">
          {subs.map(sub => (
            <li key={sub.channelId} className="subs-item">
              {sub.avatar && (
                <img className="subs-avatar" src={sub.avatar} alt="" loading="lazy" />
              )}
              <Link to={`/channel/${sub.channelId}`} className="subs-name">
                {sub.channelName}
              </Link>
              <button
                className="subs-unsub"
                onClick={() => handleUnsubscribe(sub.channelId)}
                aria-label={`Unsubscribe from ${sub.channelName}`}
              >
                Unsubscribe
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
