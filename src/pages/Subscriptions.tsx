import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getSubscriptions, getSettings, getWatchedVideoIds } from '../db/index'
import { pluginManager } from '../plugins/manager'
import type { Subscription } from '../types'
import type { SearchResult } from '../plugins/types'
import './Subscriptions.css'

type Section =
  | { channel: Subscription; status: 'loading' }
  | { channel: Subscription; status: 'done'; videos: SearchResult[] }
  | { channel: Subscription; status: 'error' }

type SortMode = 'channel' | 'date'

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

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
      .then(([s, ids]) => { setWatchedStyle(s.watchedVideoStyle ?? 'normal'); setWatchedIds(ids) })
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
      const subs = await getSubscriptions()
      if (cancelled) return
      if (!subs.length) { setInitialising(false); return }

      setSections(subs.map(channel => ({ channel, status: 'loading' })))
      setInitialising(false)

      let plugin
      try { plugin = pluginManager.getActive() } catch { return }

      for (let i = 0; i < subs.length; i += BATCH_SIZE) {
        if (cancelled) break
        const batch = subs.slice(i, i + BATCH_SIZE)
        await Promise.allSettled(batch.map(async sub => {
          try {
            const videos = await (plugin!.getChannelVideos?.(sub.channelId, VIDEOS_PER_CHANNEL) ?? Promise.resolve([]))
            if (!cancelled) setSections(prev => prev.map(s =>
              s.channel.channelId === sub.channelId ? { channel: sub, status: 'done', videos } : s
            ))
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

  // ── Date sort: flat list of all videos from completed sections ──────────────
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
    <div className="feed-page">
      <div className="feed-header">
        <h1 className="feed-heading">Subscriptions</h1>
        <div className="feed-controls">
          <div className="feed-sort">
            {(['channel', 'date'] as const).map(mode => (
              <button
                key={mode}
                className={`feed-sort-btn${sortMode === mode ? ' active' : ''}`}
                onClick={() => setSortMode(mode)}
                aria-pressed={sortMode === mode}
              >
                {mode === 'channel' ? 'By channel' : 'By date'}
              </button>
            ))}
          </div>
          <button
            className={`feed-toggle${hideWatched ? ' feed-toggle-active' : ''}`}
            onClick={() => setHideWatched(h => !h)}
            aria-pressed={hideWatched}
          >
            Unwatched only
          </button>
        </div>
      </div>

      {/* ── By date: flat sorted grid ─────────────────────────────────────────── */}
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
            <ul className="feed-grid feed-grid-flat">
              {allVideos.map(v => {
                const isWatched = watchedIds.has(v.videoId)
                return (
                  <li
                    key={v.videoId}
                    className={`feed-card${isWatched && !shouldHide && watchedStyle === 'dim' ? ' feed-card-dim' : ''}`}
                  >
                    <Link to={`/watch/${v.videoId}`} className="feed-card-thumb-link">
                      <div className="feed-card-thumb">
                        {v.thumbnail
                          ? <img src={v.thumbnail} alt="" loading="lazy" />
                          : <div className="feed-card-thumb-blank" />
                        }
                        {v.duration > 0 && (
                          <span className="feed-card-duration">{formatDuration(v.duration)}</span>
                        )}
                      </div>
                    </Link>
                    <Link to={`/watch/${v.videoId}`} className="feed-card-title">{v.title}</Link>
                    <Link to={`/channel/${v.channel.channelId}`} className="feed-card-channel">
                      {v.channel.channelName}
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </>
      )}

      {/* ── By channel: per-section layout ───────────────────────────────────── */}
      {sortMode === 'channel' && sections.map(section => {
        if (section.status === 'done' && !section.videos.length) return null

        const videos = section.status === 'done'
          ? (shouldHide
            ? section.videos.filter(v => !watchedIds.has(v.videoId))
            : section.videos)
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
              <ul className="feed-grid">
                {videos.map(v => {
                  const isWatched = watchedIds.has(v.videoId)
                  return (
                    <li
                      key={v.videoId}
                      className={`feed-card${isWatched && !shouldHide && watchedStyle === 'dim' ? ' feed-card-dim' : ''}`}
                    >
                      <Link to={`/watch/${v.videoId}`} className="feed-card-thumb-link">
                        <div className="feed-card-thumb">
                          {v.thumbnail
                            ? <img src={v.thumbnail} alt="" loading="lazy" />
                            : <div className="feed-card-thumb-blank" />
                          }
                          {v.duration > 0 && (
                            <span className="feed-card-duration">{formatDuration(v.duration)}</span>
                          )}
                        </div>
                      </Link>
                      <Link to={`/watch/${v.videoId}`} className="feed-card-title">{v.title}</Link>
                    </li>
                  )
                })}
              </ul>
            )}
          </section>
        )
      })}
    </div>
  )
}
