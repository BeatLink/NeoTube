import { useEffect, useState } from 'react'
import { getSubscriptions, getWatchedChannelIds, getSettings, saveSettings } from '../../db/index'
import PageLayout from '../../components/PageLayout'
import ChannelCard from '../../components/ChannelCard'
import ToggleButton from '../../components/ToggleButton'
import type { Subscription } from '../../types'
import './Channels.css'

export default function Channels() {
  const [subs, setSubs] = useState<Subscription[]>([])
  const [watchedChannelIds, setWatchedChannelIds] = useState<Set<string>>(new Set())
  const [filter, setFilter] = useState('')
  const [hideWatched, setHideWatched] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([getSubscriptions(), getWatchedChannelIds(), getSettings()])
      .then(([s, watchedIds, settings]) => {
        setSubs(s)
        setWatchedChannelIds(watchedIds)
        setHideWatched(settings.channelsHideWatched ?? false)
      })
      .finally(() => setLoading(false))

    const refresh = () =>
      getWatchedChannelIds().then(setWatchedChannelIds)
        .catch(() => {})
    window.addEventListener('history-changed', refresh)
    return () => window.removeEventListener('history-changed', refresh)
  }, [])

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
        <ul className="channel-grid">
          {visible.map(sub => (
            <ChannelCard
              key={sub.channelId}
              channelId={sub.channelId}
              name={sub.channelName}
              avatar={sub.avatar}
              // Drop the card from this list as soon as it's unsubscribed.
              onSubscriptionChange={subscribed => {
                if (!subscribed) setSubs(prev => prev.filter(s => s.channelId !== sub.channelId))
              }}
            />
          ))}
        </ul>
      )}
    </PageLayout>
  )
}
