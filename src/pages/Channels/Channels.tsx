import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSubscriptions, unsubscribe, getHistory, getSettings, saveSettings } from '../../db/index'
import PageLayout from '../../components/PageLayout'
import ToggleButton from '../../components/ToggleButton'
import Button from '../../components/Button'
import type { Subscription } from '../../types'
import './Channels.css'

export default function Channels() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [watchedChannelIds, setWatchedChannelIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [hideWatched, setHideWatched] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getSubscriptions(), getHistory(), getSettings()])
      .then(([s, history, settings]) => {
        setSubs(s)
        setWatchedChannelIds(new Set(history.map(e => e.channelId).filter(Boolean)))
        setHideWatched(settings.channelsHideWatched ?? false)
      })
      .finally(() => setLoading(false))

    const refresh = () =>
      getHistory().then(h => setWatchedChannelIds(new Set(h.map(e => e.channelId).filter(Boolean))))
        .catch(() => {})
    window.addEventListener('history-changed', refresh)
    return () => window.removeEventListener('history-changed', refresh)
  }, [])

  async function handleUnsubscribe(channelId: string) {
    await unsubscribe(channelId)
    setSubs(prev => prev.filter(s => s.channelId !== channelId))
  }

  let visible = hideWatched
    ? subs.filter(s => !watchedChannelIds.has(s.channelId))
    : subs

  if (filter) {
    visible = visible.filter(s => s.channelName.toLowerCase().includes(filter.toLowerCase()))
  }

  if (loading) return <p className="subs-status">Loading…</p>

  return (
    <PageLayout
      title="Channels"
      actions={subs.length > 0 ? (
        <>
          <ToggleButton
            active={hideWatched}
            onClick={() => { const next = !hideWatched; setHideWatched(next); saveSettings({ channelsHideWatched: next }).catch(() => {}) }}
          >
            Unwatched only
          </ToggleButton>
          <input
            className="subs-search"
            type="search"
            placeholder="Filter channels…"
            value={filter}
            onChange={e => setFilter(e.target.value)}
            aria-label="Filter channels"
          />
        </>
      ) : undefined}
    >
      {subs.length === 0 ? (
        <p className="subs-empty">
          You haven't subscribed to any channels yet. Subscribe from a video's watch page or channel page.
        </p>
      ) : visible.length === 0 ? (
        <p className="subs-empty">
          {hideWatched && !filter
            ? 'All channels have been watched.'
            : `No channels match "${filter}".`}
        </p>
      ) : (
        <ul className="subs-grid">
          {visible.map(sub => (
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
              <Button
                size="sm"
                className="subs-card-unsub"
                onClick={() => handleUnsubscribe(sub.channelId)}
                aria-label={`Unsubscribe from ${sub.channelName}`}
              >
                Unsubscribe
              </Button>
            </li>
          ))}
        </ul>
      )}
    </PageLayout>
  )
}
