import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { pluginManager } from '../plugins/manager'
import type { ChannelInfo, SearchResult, ChannelPlaylist } from '../plugins/types'
import { isSubscribed, subscribe, unsubscribe, getSettings, getWatchedVideoIds } from '../db/index'
import { downloadAvatar } from '../utils/avatar'
import './Channel.css'

type Tab = 'videos' | 'playlists'

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Channel() {
  const { channelId } = useParams<{ channelId: string }>()
  const [info, setInfo] = useState<ChannelInfo | null>(null)
  const [videos, setVideos] = useState<SearchResult[] | null>(null)
  const [playlists, setPlaylists] = useState<ChannelPlaylist[] | null>(null)
  const [tab, setTab] = useState<Tab>('videos')
  const [loadingInfo, setLoadingInfo] = useState(true)
  const [loadingPlaylists, setLoadingPlaylists] = useState(false)
  const [error, setError] = useState('')
  const [subscribed, setSubscribed] = useState(false)
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set())
  const [watchedStyle, setWatchedStyle] = useState<'normal' | 'dim' | 'hide'>('normal')
  const [hideWatched, setHideWatched] = useState(false)

  useEffect(() => {
    Promise.all([getSettings(), getWatchedVideoIds()])
      .then(([settings, ids]) => {
        setWatchedStyle(settings.watchedVideoStyle ?? 'normal')
        setWatchedIds(ids)
      })
      .catch(() => {})

    const refresh = () => {
      Promise.all([getSettings(), getWatchedVideoIds()])
        .then(([settings, ids]) => {
          setWatchedStyle(settings.watchedVideoStyle ?? 'normal')
          setWatchedIds(ids)
        })
        .catch(() => {})
    }
    window.addEventListener('history-changed', refresh)
    return () => window.removeEventListener('history-changed', refresh)
  }, [])

  useEffect(() => {
    if (!channelId) return
    setLoadingInfo(true)
    setInfo(null)
    setVideos(null)
    setPlaylists(null)
    setTab('videos')
    setError('')

    let cancelled = false
    const plugin = pluginManager.getActive()

    Promise.all([
      plugin.getChannelInfo(channelId),
      plugin.getChannelVideos?.(channelId) ?? Promise.resolve([]),
    ])
      .then(([channelInfo, channelVideos]) => {
        if (cancelled) return
        setInfo(channelInfo)
        setVideos(channelVideos)
        setLoadingInfo(false)
        isSubscribed(channelId).then(async subbed => {
          setSubscribed(subbed)
          if (subbed && channelInfo.avatar) {
            const blob = await downloadAvatar(channelInfo.avatar)
            if (blob) subscribe(channelInfo.channelId, channelInfo.name, blob).catch(() => {})
          }
        })
      })
      .catch((err: Error) => {
        if (!cancelled) { setError(err.message); setLoadingInfo(false) }
      })

    return () => { cancelled = true }
  }, [channelId])

  // Lazy-load playlists when that tab is first selected
  useEffect(() => {
    if (tab !== 'playlists' || playlists !== null || !channelId) return
    const plugin = pluginManager.getActive()
    if (!plugin.getChannelPlaylists) { setPlaylists([]); return }

    setLoadingPlaylists(true)
    plugin
      .getChannelPlaylists(channelId)
      .then(p => { setPlaylists(p); setLoadingPlaylists(false) })
      .catch(() => { setPlaylists([]); setLoadingPlaylists(false) })
  }, [tab, channelId, playlists])

  async function toggleSubscribe() {
    if (!channelId || !info) return
    if (subscribed) {
      await unsubscribe(channelId)
      setSubscribed(false)
    } else {
      await subscribe(channelId, info.name, info.avatar)
      setSubscribed(true)
    }
  }

  if (loadingInfo) return <div className="channel-status">Loading…</div>
  if (error) return <div className="channel-status channel-error">{error}</div>
  if (!info) return null

  return (
    <div className="channel-page">
      {/* ── Header ─────────────────────────────────────────────────────────── */}
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

      {/* ── Tabs ───────────────────────────────────────────────────────────── */}
      <div className="channel-tabs">
        <button
          className={`channel-tab ${tab === 'videos' ? 'active' : ''}`}
          onClick={() => setTab('videos')}
        >
          Videos
        </button>
        <button
          className={`channel-tab ${tab === 'playlists' ? 'active' : ''}`}
          onClick={() => setTab('playlists')}
        >
          Playlists
        </button>
        {tab === 'videos' && (
          <button
            className={`channel-tab-toggle${hideWatched ? ' active' : ''}`}
            onClick={() => setHideWatched(h => !h)}
            aria-pressed={hideWatched}
          >
            Unwatched only
          </button>
        )}
      </div>

      {/* ── Videos tab ─────────────────────────────────────────────────────── */}
      {tab === 'videos' && (
        videos === null
          ? <p className="channel-tab-status">Loading videos…</p>
          : videos.length === 0
            ? <p className="channel-tab-status">No videos found.</p>
            : (() => {
                const shouldHide = hideWatched || watchedStyle === 'hide'
                const visibleVideos = shouldHide
                  ? videos.filter(v => !watchedIds.has(v.videoId))
                  : videos
                return (
                  <ul className="channel-grid">
                    {visibleVideos.map(v => {
                      const isWatched = watchedIds.has(v.videoId)
                      const cardClass = `channel-card${isWatched && !shouldHide && watchedStyle === 'dim' ? ' channel-card-watched-dim' : ''}`
                      return (
                        <li key={v.videoId} className={cardClass}>
                          <Link to={`/watch/${v.videoId}`} className="channel-card-thumb-link">
                            <div className="channel-card-thumb">
                              {v.thumbnail
                                ? <img src={v.thumbnail} alt="" loading="lazy" />
                                : <div className="channel-card-thumb-blank" />
                              }
                              {v.duration > 0 && (
                                <span className="channel-card-duration">
                                  {formatDuration(v.duration)}
                                </span>
                              )}
                            </div>
                          </Link>
                          <Link to={`/watch/${v.videoId}`} className="channel-card-title">
                            {v.title}
                          </Link>
                        </li>
                      )
                    })}
                  </ul>
                )
              })()
      )}

      {/* ── Playlists tab ──────────────────────────────────────────────────── */}
      {tab === 'playlists' && (
        loadingPlaylists
          ? <p className="channel-tab-status">Loading playlists…</p>
          : !playlists || playlists.length === 0
            ? <p className="channel-tab-status">No playlists found.</p>
            : (
              <ul className="channel-grid">
                {playlists.map(p => (
                  <li key={p.playlistId} className="channel-card">
                    <div className="channel-card-thumb channel-card-playlist-thumb">
                      {p.thumbnail
                        ? <img src={p.thumbnail} alt="" loading="lazy" />
                        : <div className="channel-card-thumb-blank" />
                      }
                      {p.videoCount !== undefined && (
                        <span className="channel-card-duration">{p.videoCount} videos</span>
                      )}
                    </div>
                    <p className="channel-card-title">{p.title}</p>
                  </li>
                ))}
              </ul>
            )
      )}
    </div>
  )
}
