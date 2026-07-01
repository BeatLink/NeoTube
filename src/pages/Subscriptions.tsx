import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSubscriptions, unsubscribe } from '../db/index'
import type { Subscription } from '../types'
import './Subscriptions.css'

export default function Subscriptions() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [filter, setFilter] = useState('')
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

  const filtered = filter
    ? subs.filter(s => s.channelName.toLowerCase().includes(filter.toLowerCase()))
    : subs

  if (loading) return <p className="subs-status">Loading…</p>

  return (
    <div className="subs-page">
      <div className="subs-header">
        <h1 className="subs-heading">Subscriptions</h1>
        {subs.length > 0 && (
          <input
            className="subs-search"
            type="search"
            placeholder="Filter channels…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            aria-label="Filter subscriptions"
          />
        )}
      </div>

      {subs.length === 0 ? (
        <p className="subs-empty">
          You haven't subscribed to any channels yet. Subscribe from a video's watch page or channel page.
        </p>
      ) : filtered.length === 0 ? (
        <p className="subs-empty">No channels match "{filter}".</p>
      ) : (
        <ul className="subs-grid">
          {filtered.map(sub => (
            <li key={sub.channelId} className="subs-card">
              <Link to={`/channel/${sub.channelId}`} className="subs-card-link">
                {sub.avatar
                  ? <img className="subs-card-avatar" src={sub.avatar} alt="" loading="lazy" />
                  : <div className="subs-card-avatar subs-card-avatar-initial" aria-hidden="true">
                      {sub.channelName.charAt(0).toUpperCase()}
                    </div>
                }
                <p className="subs-card-name">{sub.channelName}</p>
              </Link>
              <button
                className="subs-card-unsub"
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
