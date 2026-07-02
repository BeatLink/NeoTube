import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { getHistory, removeFromHistory, clearHistory, updateHistoryThumbnail } from '../db/index'
import { downloadAvatar } from '../utils/avatar'
import type { WatchHistoryEntry } from '../types'
import './History.css'

const PAGE_SIZE = 24
const SESSION_KEY = 'history-scroll'

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

  // Read saved scroll state once at mount
  const [initState] = useState(() => {
    try {
      const s = JSON.parse(sessionStorage.getItem(SESSION_KEY) ?? '{}')
      return { count: (s.count as number) || PAGE_SIZE, scrollY: (s.scrollY as number) || 0 }
    } catch { return { count: PAGE_SIZE, scrollY: 0 } }
  })

  const [visibleCount, setVisibleCount] = useState(initState.count)
  const [backfillProgress, setBackfillProgress] = useState<{ done: number; total: number } | null>(null)
  const visibleCountRef = useRef(visibleCount)
  const scrollRestoredRef = useRef(false)
  const sentinelRef = useRef<HTMLDivElement>(null)

  // Keep ref in sync so the unmount cleanup captures the latest value
  useEffect(() => { visibleCountRef.current = visibleCount }, [visibleCount])

  // Save scroll position and visible count on unmount
  useEffect(() => {
    return () => {
      sessionStorage.setItem(SESSION_KEY, JSON.stringify({
        scrollY: window.scrollY,
        count: visibleCountRef.current,
      }))
    }
  }, [])

  useEffect(() => {
    getHistory().then(setHistory).finally(() => setLoading(false))
    const refresh = () => getHistory().then(setHistory)
    window.addEventListener('history-changed', refresh)
    return () => window.removeEventListener('history-changed', refresh)
  }, [])

  // Restore scroll after data loads and items are rendered
  useEffect(() => {
    if (!loading && history.length > 0 && !scrollRestoredRef.current && initState.scrollY > 0) {
      window.scrollTo(0, initState.scrollY)
      scrollRestoredRef.current = true
    }
  }, [loading, history.length, initState.scrollY])

  // Backfill blob thumbnails for entries that only have CDN URLs.
  // Dep is [loading]: fires once when loading flips to false, which is batched
  // with setHistory, so the closure captures the fully-loaded history array.
  useEffect(() => {
    if (loading) return
    const missing = history.filter(e => e.thumbnail && !e.thumbnail.startsWith('data:'))
    console.log('[history backfill] total:', history.length, 'need caching:', missing.length, 'electron:', !!window.electron?.downloadAvatar)
    if (!missing.length) return
    let done = 0
    let cancelled = false
    setBackfillProgress({ done: 0, total: missing.length })
    ;(async () => {
      const BATCH = 10
      for (let i = 0; i < missing.length; i += BATCH) {
        if (cancelled) break
        await Promise.allSettled(missing.slice(i, i + BATCH).map(async entry => {
          const blob = await downloadAvatar(entry.thumbnail)
          console.log('[history backfill]', entry.videoId, blob ? 'cached' : 'failed')
          if (blob && !cancelled) {
            await updateHistoryThumbnail(entry.videoId, blob)
            setHistory(prev => prev.map(e => e.videoId === entry.videoId ? { ...e, thumbnail: blob } : e))
          }
          if (!cancelled) setBackfillProgress({ done: ++done, total: missing.length })
        }))
      }
      if (!cancelled) setBackfillProgress(null)
    })()
    return () => { cancelled = true; setBackfillProgress(null) }
  }, [loading])

  // Attach IntersectionObserver once data is loaded and sentinel is in the DOM
  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => {
        if (entries[0].isIntersecting) setVisibleCount(c => c + PAGE_SIZE)
      },
      { rootMargin: '200px' },
    )
    observer.observe(el)
    return () => observer.disconnect()
  }, [loading])

  async function handleRemove(videoId: string) {
    await removeFromHistory(videoId)
    setHistory(prev => prev.filter(e => e.videoId !== videoId))
  }

  async function handleClearAll() {
    await clearHistory()
    setHistory([])
    setVisibleCount(PAGE_SIZE)
    setConfirmClear(false)
  }

  if (loading) return <p className="history-status">Loading…</p>

  const visible = history.slice(0, visibleCount)

  return (
    <div className="history-page">
      <div className="history-header">
        <h1 className="history-heading">Watch History</h1>
        {backfillProgress && (
          <p className="history-status history-backfill-status">
            Caching thumbnails… {backfillProgress.done}/{backfillProgress.total}
          </p>
        )}
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
        <>
          <ul className="history-grid">
            {visible.map(entry => (
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
          {visibleCount < history.length && (
            <div ref={sentinelRef} className="history-sentinel" aria-hidden="true" />
          )}
        </>
      )}
    </div>
  )
}
