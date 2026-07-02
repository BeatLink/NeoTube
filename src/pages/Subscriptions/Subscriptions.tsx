import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSubscriptions, getSettings, saveSettings, getWatchedVideoIds, getAllCachedChannelVideos } from '../../db/index'
import { refreshChannelVideos } from '../../services/videoCache'
import PageLayout from '../../components/PageLayout'
import VideoCard from '../../components/VideoCard'
import ToggleButton from '../../components/ToggleButton'
import MenuButton from '../../components/MenuButton'
import type { Subscription } from '../../types'
import type { SearchResult } from '../../plugins/types'
import './Subscriptions.css'

type Section =
  | { channel: Subscription; status: 'loading' }
  | { channel: Subscription; status: 'done'; videos: SearchResult[] }
  | { channel: Subscription; status: 'error' }

type SortMode = 'channel' | 'date'

const VIDEOS_PER_CHANNEL = 8
const BATCH_SIZE = 3

export default function Subscriptions() {
  const [sections, setSections] = useState<Section[]>([])
  const [initialising, setInitialising] = useState(true)
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set())
  const [watchedStyle, setWatchedStyle] = useState<'normal' | 'dim' | 'hide'>('normal')
  const [hideWatched, setHideWatched] = useState(false)
  const [sortMode, setSortMode] = useState<SortMode>('channel')

  useEffect(() => {
    Promise.all([getSettings(), getWatchedVideoIds()])
      .then(([s, ids]) => {
        setWatchedStyle(s.watchedVideoStyle ?? 'normal')
        setHideWatched(s.feedHideWatched ?? false)
        setSortMode(s.feedSortMode ?? 'channel')
        setWatchedIds(ids)
      })
      .catch(() => {})

    const refresh = () =>
      Promise.all([getSettings(), getWatchedVideoIds()])
        .then(([s, ids]) => { setWatchedStyle(s.watchedVideoStyle ?? 'normal'); setWatchedIds(ids) })
        .catch(() => {})
    window.addEventListener('history-changed', refresh)
    return () => window.removeEventListener('history-changed', refresh)
  }, [])

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const [subs, allCaches] = await Promise.all([getSubscriptions(), getAllCachedChannelVideos()])
      if (cancelled) return
      if (!subs.length) { setInitialising(false); return }

      setSections(subs.map(channel => {
        const cached = allCaches.get(channel.channelId)
        return cached
          ? { channel, status: 'done' as const, videos: cached as SearchResult[] }
          : { channel, status: 'loading' as const }
      }))
      setInitialising(false)

      for (let i = 0; i < subs.length; i += BATCH_SIZE) {
        if (cancelled) break
        const batch = subs.slice(i, i + BATCH_SIZE)
        await Promise.allSettled(batch.map(async sub => {
          try {
            await refreshChannelVideos(
              sub.channelId,
              fresh => {
                if (!cancelled) setSections(prev => prev.map(s =>
                  s.channel.channelId === sub.channelId
                    ? { channel: sub, status: 'done', videos: fresh as SearchResult[] }
                    : s
                ))
              },
              VIDEOS_PER_CHANNEL,
            )
          } catch {
            if (!cancelled) setSections(prev => prev.map(s =>
              s.channel.channelId === sub.channelId ? { channel: sub, status: 'error' } : s
            ))
          }
        }))
      }
    })()
    return () => { cancelled = true }
  }, [])

  if (initialising) return <p className="feed-status">Loading…</p>

  if (!sections.length) return (
    <p className="feed-empty">
      You haven't subscribed to any channels yet. Subscribe from a video's watch page or channel page.
    </p>
  )

  const shouldHide = hideWatched || watchedStyle === 'hide'

  const doneSections = sections.filter((s): s is Extract<Section, { status: 'done' }> => s.status === 'done')
  const loadingCount = sections.filter(s => s.status === 'loading').length

  const allVideos = sortMode === 'date'
    ? doneSections
        .flatMap(s => s.videos.map(v => ({ ...v, channel: s.channel })))
        .filter(v => !shouldHide || !watchedIds.has(v.videoId))
        .sort((a, b) => {
          if (!a.publishedAt && !b.publishedAt) return 0
          if (!a.publishedAt) return 1
          if (!b.publishedAt) return -1
          return b.publishedAt.localeCompare(a.publishedAt)
        })
    : []

  return (
    <PageLayout
      title="Subscriptions"
      className="feed-page"
      actions={
        <>
          <MenuButton
            options={[
              { value: 'channel', label: 'By channel' },
              { value: 'date', label: 'By date' },
            ]}
            value={sortMode}
            onChange={v => {
              const mode = v as SortMode
              setSortMode(mode)
              saveSettings({ feedSortMode: mode }).catch(() => {})
            }}
          />
          <ToggleButton
            active={hideWatched}
            onClick={() => {
              const next = !hideWatched
              setHideWatched(next)
              saveSettings({ feedHideWatched: next }).catch(() => {})
            }}
          >
            Unwatched only
          </ToggleButton>
        </>
      }
    >
      {sortMode === 'date' && (
        <>
          {loadingCount > 0 && (
            <p className="feed-status">
              Loading {loadingCount} of {sections.length} channel{sections.length !== 1 ? 's' : ''}…
            </p>
          )}
          {allVideos.length === 0 && loadingCount === 0 ? (
            <p className="feed-empty">No videos found.</p>
          ) : (
            <ul className="video-grid feed-grid-flat">
              {allVideos.map(v => (
                <VideoCard
                  key={v.videoId}
                  videoId={v.videoId}
                  title={v.title}
                  thumbnail={v.thumbnail}
                  duration={v.duration}
                  channelId={v.channel.channelId}
                  channelName={v.channel.channelName}
                  dimmed={watchedIds.has(v.videoId) && !shouldHide && watchedStyle === 'dim'}
                />
              ))}
            </ul>
          )}
        </>
      )}

      {sortMode === 'channel' && sections.map(section => {
        if (section.status === 'done' && !section.videos.length) return null

        const videos = section.status === 'done'
          ? (shouldHide ? section.videos.filter(v => !watchedIds.has(v.videoId)) : section.videos)
          : []

        if (section.status === 'done' && !videos.length) return null

        return (
          <section key={section.channel.channelId} className="feed-section">
            <Link to={`/channel/${section.channel.channelId}`} className="feed-channel-link">
              {section.channel.avatar
                ? <img className="feed-channel-avatar" src={section.channel.avatar} alt="" loading="lazy" />
                : <div className="feed-channel-avatar feed-channel-avatar-initial" aria-hidden="true">
                    {section.channel.channelName.charAt(0).toUpperCase()}
                  </div>
              }
              <span className="feed-channel-name">{section.channel.channelName}</span>
            </Link>

            {section.status === 'loading' && (
              <p className="feed-section-status">Loading…</p>
            )}
            {section.status === 'error' && (
              <p className="feed-section-status feed-section-error">Failed to load videos.</p>
            )}
            {section.status === 'done' && (
              <ul className="video-grid">
                {videos.map(v => (
                  <VideoCard
                    key={v.videoId}
                    videoId={v.videoId}
                    title={v.title}
                    thumbnail={v.thumbnail}
                    duration={v.duration}
                    dimmed={watchedIds.has(v.videoId) && !shouldHide && watchedStyle === 'dim'}
                  />
                ))}
              </ul>
            )}
          </section>
        )
      })}
    </PageLayout>
  )
}
