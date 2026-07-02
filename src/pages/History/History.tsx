import { useEffect, useRef, useState } from 'react'
import { getHistory, removeFromHistory, clearHistory } from '../../db/index'
import { cacheHistoryThumbnails } from '../../services/videoCache'
import PageLayout from '../../components/PageLayout'
import VideoCard from '../../components/VideoCard'
import Button from '../../components/Button'
import { timeAgo } from '../../utils/format'
import type { WatchHistoryEntry } from '../../types'
import './History.css'

const PAGE_SIZE = 24
const SESSION_KEY = 'history-scroll'

export default function History() {
  const [history, setHistory] = useState<WatchHistoryEntry[]>([])
  const [loading, setLoading] = useState(true)
  const [confirmClear, setConfirmClear] = useState(false)

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

  useEffect(() => { visibleCountRef.current = visibleCount }, [visibleCount])

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

  useEffect(() => {
    if (!loading && history.length > 0 && !scrollRestoredRef.current && initState.scrollY > 0) {
      window.scrollTo(0, initState.scrollY)
      scrollRestoredRef.current = true
    }
  }, [loading, history.length, initState.scrollY])

  useEffect(() => {
    if (loading) return
    const toBackfill = history.filter(e => !e.thumbnail?.startsWith('data:'))
    if (!toBackfill.length) return
    let cancelled = false
    let done = 0
    setBackfillProgress({ done: 0, total: toBackfill.length })
    cacheHistoryThumbnails(toBackfill, (videoId, dataUri) => {
      if (cancelled) return
      done++
      setHistory(prev => prev.map(e => e.videoId === videoId ? { ...e, thumbnail: dataUri } : e))
      setBackfillProgress(p => p ? { ...p, done } : null)
    }).finally(() => {
      if (!cancelled) setBackfillProgress(null)
    })
    return () => { cancelled = true; setBackfillProgress(null) }
  }, [loading])

  useEffect(() => {
    const el = sentinelRef.current
    if (!el) return
    const observer = new IntersectionObserver(
      entries => { if (entries[0].isIntersecting) setVisibleCount(c => c + PAGE_SIZE) },
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
    <PageLayout
      title="Watch History"
      actions={history.length > 0 ? (
        confirmClear ? (
          <div className="history-confirm">
            <span>Clear all history?</span>
            <Button size="sm" variant="danger" onClick={handleClearAll}>Yes, clear</Button>
            <Button size="sm" onClick={() => setConfirmClear(false)}>Cancel</Button>
          </div>
        ) : (
          <>
            {backfillProgress && (
              <p className="history-backfill-status">
                Caching thumbnails… {backfillProgress.done}/{backfillProgress.total}
              </p>
            )}
            <Button onClick={() => setConfirmClear(true)}>Clear all</Button>
          </>
        )
      ) : undefined}
    >
      {history.length === 0 ? (
        <p className="history-empty">No watch history yet. Videos you watch will appear here.</p>
      ) : (
        <>
          <ul className="video-grid">
            {visible.map(entry => (
              <VideoCard
                key={entry.videoId}
                videoId={entry.videoId}
                title={entry.title}
                thumbnail={entry.thumbnail}
                duration={entry.duration}
                channelId={entry.channelId}
                channelName={entry.channelName}
                meta={<>
                  {timeAgo(entry.watchedAt)}
                  {entry.watchCount > 1 && (
                    <span className="video-card-count"> · {entry.watchCount}×</span>
                  )}
                </>}
                onRemove={() => handleRemove(entry.videoId)}
                removeLabel={`Remove ${entry.title} from history`}
              />
            ))}
          </ul>
          {visibleCount < history.length && (
            <div ref={sentinelRef} className="history-sentinel" aria-hidden="true" />
          )}
        </>
      )}
    </PageLayout>
  )
}
