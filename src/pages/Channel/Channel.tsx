import { useEffect, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import { pluginManager } from '../../plugins/manager'
import type { ChannelInfo, SearchResult, ChannelPlaylist } from '../../plugins/types'
import { isSubscribed, subscribe, unsubscribe, getSettings, saveSettings, getWatchedVideoIds } from '../../db/index'
import { downloadAvatar } from '../../utils/avatar'
import { getOrFetchChannelVideos } from '../../services/videoCache'
import { getChannelInfoCached } from '../../services/metadata'
import { parseRelativeAge, parseViewCount } from '../../utils/format'
import PageLayout from '../../components/PageLayout'
import VideoCard from '../../components/VideoCard'
import VideoThumbnail from '../../components/VideoThumbnail'
import ToggleButton from '../../components/ToggleButton'
import Button from '../../components/Button'
import './Channel.css'

type Tab = 'videos' | 'playlists'

const PAGE_SIZE = 24

type SortMode = 'newest' | 'oldest' | 'popular'

const SORT_OPTIONS: ReadonlyArray<{ value: SortMode; label: string }> = [
  { value: 'newest', label: 'Newest' },
  { value: 'oldest', label: 'Oldest' },
  { value: 'popular', label: 'Most popular' },
]

/**
 * Sorts by the values parsed out of YouTube's display text.
 *
 * `parseRelativeAge` returns age in ms, so smaller is newer. Videos YouTube
 * gives no date or view count for sort last in every mode rather than jumping
 * to the front.
 */
function sortVideos(videos: SearchResult[], mode: SortMode): SearchResult[] {
  const sorted = [...videos]
  switch (mode) {
    case 'newest':
      return sorted.sort((a, b) =>
        parseRelativeAge(a.publishedText) - parseRelativeAge(b.publishedText))
    case 'oldest':
      return sorted.sort((a, b) => {
        const ageA = parseRelativeAge(a.publishedText)
        const ageB = parseRelativeAge(b.publishedText)
        // Unknown dates (Infinity) stay at the end instead of leading.
        if (ageA === Infinity) return 1
        if (ageB === Infinity) return -1
        return ageB - ageA
      })
    case 'popular':
      return sorted.sort((a, b) =>
        parseViewCount(b.viewCountText) - parseViewCount(a.viewCountText))
  }
}

/** Channel details panel — joined date, totals, location, tags. */
function ChannelDetails({ info }: { info: ChannelInfo }) {
  const rows: Array<[string, string]> = []
  if (info.joinedText) rows.push(['Joined', info.joinedText.replace(/^Joined\s+/i, '')])
  if (info.totalViewsText) rows.push(['Views', info.totalViewsText.replace(/\s*views$/i, '')])
  if (info.videoCountText) rows.push(['Videos', info.videoCountText.replace(/\s*videos?$/i, '')])
  if (info.country) rows.push(['Location', info.country])

  const tags = info.tags ?? []
  if (rows.length === 0 && tags.length === 0) return null

  return (
    <section className="channel-details">
      <h3 className="channel-details-title">Details</h3>
      <dl className="channel-details-list">
        {rows.map(([label, value]) => (
          <div key={label} className="channel-details-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {tags.length > 0 && (
        <>
          <h3 className="channel-details-title">Tags</h3>
          <ul className="channel-tags">
            {tags.map(tag => <li key={tag} className="channel-tag">{tag}</li>)}
          </ul>
        </>
      )}
    </section>
  )
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
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE)
  const [sortMode, setSortMode] = useState<SortMode>('newest')
  const sentinelRef = useRef<HTMLDivElement>(null)

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
    setVisibleCount(PAGE_SIZE)

    let cancelled = false

    // Infinity → follow continuations until the channel is exhausted. YouTube
    // returns 30 per page, which used to be the hard cap on what was shown.
    getOrFetchChannelVideos(channelId, fresh => {
      if (!cancelled) setVideos(fresh as SearchResult[])
    }, Infinity).then(cached => {
      if (cached && !cancelled) setVideos(cached as SearchResult[])
    }).catch(() => {})

    getChannelInfoCached(channelId)
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

  // Reveal another chunk of the grid when the sentinel scrolls into view.
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setVisibleCount(c => c + PAGE_SIZE) },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [videos, tab, visibleCount])

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
    <PageLayout
      className="channel-page"
      title={info.name}
      subtitle={info.subscriberCount !== undefined
        ? `${info.subscriberCount.toLocaleString()} subscribers`
        : undefined}
      icon={info.avatar
        ? <img className="channel-avatar" src={info.avatar} alt={info.name} />
        : undefined}
      actions={
        <Button
          className={`channel-sub-btn${subscribed ? ' subscribed' : ''}`}
          onClick={toggleSubscribe}
        >
          {subscribed ? 'Subscribed' : 'Subscribe'}
        </Button>
      }
      banner={info.banner}
      extra={
        <>
          {info.description && (
            <div className="channel-description">
              <p>{info.description}</p>
            </div>
          )}
          <ChannelDetails info={info} />
        </>
      }
      tabs={
        <div className="channel-tabs">
          <button
            className={`channel-tab${tab === 'videos' ? ' active' : ''}`}
            onClick={() => setTab('videos')}
          >
            Videos
          </button>
          <button
            className={`channel-tab${tab === 'playlists' ? ' active' : ''}`}
            onClick={() => setTab('playlists')}
          >
            Playlists
          </button>
          {tab === 'videos' && (
            <>
              <select
                className="channel-sort"
                value={sortMode}
                onChange={e => setSortMode(e.target.value as SortMode)}
                aria-label="Sort videos"
                style={{ marginLeft: 'auto' }}
              >
                {SORT_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ToggleButton
                active={hideWatched}
                onClick={() => {
                  const next = !hideWatched
                  setHideWatched(next)
                  saveSettings({ channelPageHideWatched: next }).catch(() => {})
                }}
              >
                Unwatched only
              </ToggleButton>
            </>
          )}
        </div>
      }
    >
      {tab === 'videos' && (
        videos === null
          ? <p className="channel-tab-status">Loading videos…</p>
          : videos.length === 0
            ? <p className="channel-tab-status">No videos found.</p>
            : (() => {
                const filtered = shouldHide
                  ? videos.filter(v => !watchedIds.has(v.videoId))
                  : videos
                const visibleVideos = sortVideos(filtered, sortMode)
                // A channel can return hundreds of videos; render them in
                // chunks so the grid stays responsive.
                const shown = visibleVideos.slice(0, visibleCount)
                return (
                  <>
                    <ul className="video-grid">
                      {shown.map(v => (
                        <VideoCard
                          key={v.videoId}
                          videoId={v.videoId}
                          title={v.title}
                          thumbnail={v.thumbnail}
                          duration={v.duration}
                          viewCountText={v.viewCountText}
                          publishedText={v.publishedText}
                          dimmed={watchedIds.has(v.videoId) && !shouldHide && watchedStyle === 'dim'}
                        />
                      ))}
                    </ul>
                    {visibleCount < visibleVideos.length && (
                      <div ref={sentinelRef} className="channel-sentinel" aria-hidden="true" />
                    )}
                  </>
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
    </PageLayout>
  )
}
