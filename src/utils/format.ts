export function formatDuration(seconds: number): string {
  if (!seconds) return ''
  const h = Math.floor(seconds / 3600)
  const m = Math.floor((seconds % 3600) / 60)
  const s = seconds % 60
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
  return `${m}:${String(s).padStart(2, '0')}`
}

/**
 * Abbreviates a view count, e.g. 1_432_912 → "1.4M views".
 *
 * YouTube's listing endpoints usually hand back pre-formatted text, so prefer
 * `SearchResult.viewCountText` when it exists; this covers the cases where only
 * a raw number is available.
 */
export function formatViews(count: number): string {
  if (!Number.isFinite(count) || count < 0) return ''
  const abbreviate = (value: number, suffix: string) => {
    const rounded = value >= 100 ? Math.round(value) : Math.round(value * 10) / 10
    return `${rounded}${suffix}`
  }
  const text =
    count >= 1_000_000_000 ? abbreviate(count / 1_000_000_000, 'B')
    : count >= 1_000_000 ? abbreviate(count / 1_000_000, 'M')
    : count >= 1_000 ? abbreviate(count / 1_000, 'K')
    : String(count)
  return `${text} ${count === 1 ? 'view' : 'views'}`
}

export function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60_000)
  if (m < 1) return 'just now'
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  const d = Math.floor(h / 24)
  if (d < 30) return `${d}d ago`
  const mo = Math.floor(d / 30)
  if (mo < 12) return `${mo}mo ago`
  return `${Math.floor(mo / 12)}y ago`
}
