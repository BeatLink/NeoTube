import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { pluginManager } from '../../plugins/manager'
import { getSettings, getWatchedVideoIds } from '../../db/index'
import VideoThumbnail from '../../components/VideoThumbnail'
import { formatViews } from '../../utils/format'
import ChannelCard from '../../components/ChannelCard'
import type { SearchResult, ChannelSearchResult } from '../../plugins/types'
import './Search.css'

type SearchTab = 'videos' | 'channels'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; results: SearchResult[] }

type ChannelState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; results: ChannelSearchResult[] }

export default function Search() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const [state, setState] = useState<State>({ status: 'idle' })
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set())
  const [watchedStyle, setWatchedStyle] = useState<'normal' | 'dim' | 'hide'>('normal')
  const [tab, setTab] = useState<SearchTab>('videos')
  const [channelState, setChannelState] = useState<ChannelState>({ status: 'idle' })

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
    if (!query) { setState({ status: 'idle' }); return }

    setState({ status: 'loading' })
    let cancelled = false

    let plugin
    try { plugin = pluginManager.getActive() }
    catch { setState({ status: 'error', message: 'No video plugin available.' }); return }

    plugin
      .search(query)
      .then(results => { if (!cancelled) setState({ status: 'ready', results }) })
      .catch((err: Error) => { if (!cancelled) setState({ status: 'error', message: err.message }) })

    return () => { cancelled = true }
  }, [query])

  useEffect(() => { setTab('videos'); setChannelState({ status: 'idle' }) }, [query])

  // Channel results are a separate request, so only fetch them if asked for.
  useEffect(() => {
    if (tab !== 'channels' || channelState.status !== 'idle' || !query) return
    const plugin = pluginManager.getActive()
    if (!plugin.searchChannels) { setChannelState({ status: 'ready', results: [] }); return }

    let cancelled = false
    setChannelState({ status: 'loading' })
    plugin
      .searchChannels(query)
      .then(results => { if (!cancelled) setChannelState({ status: 'ready', results }) })
      .catch(() => { if (!cancelled) setChannelState({ status: 'ready', results: [] }) })
    return () => { cancelled = true }
  }, [tab, query, channelState.status])

  if (!query) {
    return <p className="search-hint">Enter a search term or paste a YouTube URL in the bar above.</p>
  }

  if (state.status === 'error') {
    return <p className="search-status search-error">{state.message}</p>
  }

  const visibleResults = state.status === 'ready'
    ? (watchedStyle === 'hide'
        ? state.results.filter(r => !watchedIds.has(r.videoId))
        : state.results)
    : []

  return (
    <div className="search-page">
      <h2 className="search-heading">Results for "{query}"</h2>

      <div className="search-tabs">
        <button
          className={`search-tab${tab === 'videos' ? ' active' : ''}`}
          onClick={() => setTab('videos')}
        >
          Videos
        </button>
        <button
          className={`search-tab${tab === 'channels' ? ' active' : ''}`}
          onClick={() => setTab('channels')}
        >
          Channels
        </button>
      </div>

      {tab === 'videos' && (
        state.status === 'loading'
          ? <p className="search-status">Searching…</p>
          : visibleResults.length === 0
            ? <p className="search-status">No videos for "{query}".</p>
            : (
              <ul className="search-results">
                {visibleResults.map(r => {
                  const isWatched = watchedIds.has(r.videoId)
                  const cardClass = `result-card${isWatched && watchedStyle === 'dim' ? ' result-watched-dim' : ''}`
                  return (
                    <li key={r.videoId} className={cardClass}>
                      <Link to={`/watch/${r.videoId}`} className="result-thumb-wrap">
                        <VideoThumbnail src={r.thumbnail} duration={r.duration} />
                      </Link>
                      <div className="result-info">
                        <Link to={`/watch/${r.videoId}`} className="result-title">{r.title}</Link>
                        <Link to={`/channel/${r.channelId}`} className="result-channel">
                          {r.channelName}
                        </Link>
                        {(() => {
                          // YouTube supplies these already humanized; fall back to
                          // formatting a raw count when it doesn't.
                          const views = r.viewCountText
                            ?? (r.viewCount !== undefined ? formatViews(r.viewCount) : undefined)
                          const stats = [views, r.publishedText].filter(Boolean)
                          return stats.length > 0 && (
                            <p className="result-views">{stats.join(' · ')}</p>
                          )
                        })()}
                      </div>
                    </li>
                  )
                })}
              </ul>
            )
      )}

      {tab === 'channels' && (
        channelState.status !== 'ready'
          ? <p className="search-status">Searching…</p>
          : channelState.results.length === 0
            ? <p className="search-status">No channels for "{query}".</p>
            : (
              <ul className="channel-grid">
                {channelState.results.map(c => (
                  <ChannelCard
                    key={c.channelId}
                    channelId={c.channelId}
                    name={c.name}
                    avatar={c.avatar}
                    meta={c.subscriberCountText}
                  />
                ))}
              </ul>
            )
      )}
    </div>
  )
}
