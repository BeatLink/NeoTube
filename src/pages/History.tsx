import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getHistory, removeFromHistory, clearHistory } from '../db/index'
import type { WatchHistoryEntry } from '../types'
import './History.css'

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1)  return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}

function formatDuration(s: number): string {
  if (!s) return ''
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = s % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`
  return `${m}:${String(sec).padStart(2, '0')}`
}

export default function History() {
  const [history, setHistory] = useState<WatchHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)

  useEffect(() => {
    getHistory().then(setHistory).finally(() => setLoading(false))
    const refresh = () => getHistory().then(setHistory)
    window.addEventListener('history-changed', refresh)
    return () => window.removeEventListener('history-changed', refresh)
  }, [])

  async function handleRemove(videoId: string) {
    await removeFromHistory(videoId)
    setHistory(prev => prev.filter(e => e.videoId !== videoId))
  }

  async function handleClearAll() {
    await clearHistory()
    setHistory([])
    setConfirmClear(false)
  }

  if (loading) return <p className="history-status">Loading…</p>

  return (
    <div className="history-page">
      <div className="history-header">
        <h1 className="history-heading">Watch History</h1>
        {history.length > 0 && (
          confirmClear ? (
            <div className="history-confirm">
              <span>Clear all history?</span>
              <button className="history-confirm-yes" onClick={handleClearAll}>Yes, clear</button>
              <button className="history-confirm-no" onClick={() => setConfirmClear(false)}>Cancel</button>
            </div>
          ) : (
            <button className="history-clear-btn" onClick={() => setConfirmClear(true)}>
              Clear all
            </button>
          )
        )}
      </div>

      {history.length === 0 ? (
        <p className="history-empty">No watch history yet. Videos you watch will appear here.</p>
      ) : (
        <ul className="history-grid">
          {history.map(entry => (
            <li key={entry.videoId} className="history-card">
              <Link to={`/watch/${entry.videoId}`} className="history-thumb-link">
                <div className="history-thumb">
                  {entry.thumbnail
                    ? <img src={entry.thumbnail} alt="" loading="lazy" />
                    : <div className="history-thumb-blank" />
                  }
                  {entry.duration > 0 && (
                    <span className="history-duration">{formatDuration(entry.duration)}</span>
                  )}
                </div>
              </Link>
              <div className="history-info">
                <Link to={`/watch/${entry.videoId}`} className="history-title">
                  {entry.title}
                </Link>
                <Link to={`/channel/${entry.channelId}`} className="history-channel">
                  {entry.channelName}
                </Link>
                <p className="history-meta">
                  {timeAgo(entry.watchedAt)}
                  {entry.watchCount > 1 && (
                    <span className="history-count"> · {entry.watchCount}×</span>
                  )}
                </p>
              </div>
              <button
                className="history-remove"
                onClick={() => handleRemove(entry.videoId)}
                aria-label={`Remove ${entry.title} from history`}
                title="Remove from history"
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
