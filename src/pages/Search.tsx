import { useEffect, useState } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { pluginManager } from '../plugins/manager'
import type { SearchResult } from '../plugins/types'
import './Search.css'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; results: SearchResult[] }

function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

export default function Search() {
  const [params] = useSearchParams()
  const query = params.get('q') ?? ''
  const [state, setState] = useState<State>({ status: 'idle' })

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

  return (
    <div className="search-page">
      <h2 className="search-heading">Results for "{query}"</h2>
      <ul className="search-results">
        {state.results.map(r => (
          <li key={r.videoId}>
            <Link to={`/watch/${r.videoId}`} className="result-card">
              <div className="result-thumb-wrap">
                {r.thumbnail
                  ? <img className="result-thumb" src={r.thumbnail} alt="" loading="lazy" />
                  : <div className="result-thumb result-thumb-blank" />
                }
                {r.duration > 0 && (
                  <span className="result-duration">{formatDuration(r.duration)}</span>
                )}
              </div>
              <div className="result-info">
                <p className="result-title">{r.title}</p>
                <p className="result-channel">{r.channelName}</p>
                {r.viewCount !== undefined && (
                  <p className="result-views">{r.viewCount.toLocaleString()} views</p>
                )}
              </div>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  )
}
