import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pluginManager } from '../plugins/manager'
import type { ChannelInfo, SearchResult, ChannelPlaylist } from '../plugins/types'
import { isSubscribed, subscribe, unsubscribe, getSettings, saveSettings, getWatchedVideoIds } from '../db/index'
import { downloadAvatar } from '../utils/avatar'
import { getOrFetchChannelVideos } from '../services/videoCache'
import VideoCard from '../components/VideoCard'
import VideoThumbnail from '../components/VideoThumbnail'
import ToggleButton from '../components/ToggleButton'
import Button from '../components/Button'
import './Channel.css'

type Tab = 'videos' | 'playlists'

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
        setHideWatched(settings.channelPageHideWatched ?? false)
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

    getOrFetchChannelVideos(channelId, fresh => {
      if (!cancelled) setVideos(fresh as SearchResult[])
    }).then(cached => {
      if (cached && !cancelled) setVideos(cached as SearchResult[])
    }).catch(() => {})

    plugin.getChannelInfo(channelId)
      .then(channelInfo => {
        if (cancelled) return
        setInfo(channelInfo)
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

  const shouldHide = hideWatched || watchedStyle === 'hide'

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
          <Button
            className={`channel-sub-btn${subscribed ? ' subscribed' : ''}`}
            onClick={toggleSubscribe}
          >
            {subscribed ? 'Subscribed' : 'Subscribe'}
          </Button>
        </div>
      </div>

      {info.description && (
        <details className="channel-description">
          <summary>About</summary>
          <p>{info.description}</p>
        </details>
      )}

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
          <ToggleButton
            active={hideWatched}
            onClick={() => {
              const next = !hideWatched
              setHideWatched(next)
              saveSettings({ channelPageHideWatched: next }).catch(() => {})
            }}
            style={{ marginLeft: 'auto' }}
          >
            Unwatched only
          </ToggleButton>
        )}
      </div>

      {tab === 'videos' && (
        videos === null
          ? <p className="channel-tab-status">Loading videos…</p>
          : videos.length === 0
            ? <p className="channel-tab-status">No videos found.</p>
            : (() => {
                const visibleVideos = shouldHide
                  ? videos.filter(v => !watchedIds.has(v.videoId))
                  : videos
                return (
                  <ul className="video-grid">
                    {visibleVideos.map(v => (
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
                )
              })()
      )}

      {tab === 'playlists' && (
        loadingPlaylists
          ? <p className="channel-tab-status">Loading playlists…</p>
          : !playlists || playlists.length === 0
            ? <p className="channel-tab-status">No playlists found.</p>
            : (
              <ul className="video-grid">
                {playlists.map(p => (
                  <li key={p.playlistId} className="video-card">
                    <VideoThumbnail src={p.thumbnail} />
                    <p className="video-card-title">{p.title}</p>
                    {p.videoCount !== undefined && (
                      <p className="video-card-meta">{p.videoCount} videos</p>
                    )}
                  </li>
                ))}
              </ul>
            )
      )}
    </div>
  )
}
