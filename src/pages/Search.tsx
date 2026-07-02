import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { pluginManager } from '../plugins/manager'
import { getSettings, getWatchedVideoIds } from '../db/index'
import VideoThumbnail from '../components/VideoThumbnail'
import { formatDuration } from '../utils/format'
import type { SearchResult } from '../plugins/types'
import './Search.css'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; results: SearchResult[] }

export default function Search() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const [state, setState] = useState<State>({ status: 'idle' })
  const [watchedIds, setWatchedIds] = useState<Set<string>>(new Set())
  const [watchedStyle, setWatchedStyle] = useState<'normal' | 'dim' | 'hide'>('normal')

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

  if (!query) {
    return <p className="search-hint">Enter a search term or paste a YouTube URL in the bar above.</p>
  }

  if (state.status === 'loading') return <p className="search-status">Searching…</p>

  if (state.status === 'error') {
    return <p className="search-status search-error">{state.message}</p>
  }

  if (state.status === 'ready' && state.results.length === 0) {
    return <p className="search-status">No results for "{query}".</p>
  }

  if (state.status !== 'ready') return null

  const visibleResults = watchedStyle === 'hide'
    ? state.results.filter(r => !watchedIds.has(r.videoId))
    : state.results

  return (
    <div className="search-page">
      <h2 className="search-heading">Results for "{query}"</h2>
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
                {r.viewCount !== undefined && (
                  <p className="result-views">{r.viewCount.toLocaleString()} views</p>
                )}
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
