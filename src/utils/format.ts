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

/**
 * Turns a view-count label back into a number for sorting, e.g. "1.4M views"
 * → 1_400_000 and "128,231 views" → 128_231.
 *
 * YouTube only gives us the rendered string, so this is approximate for
 * abbreviated values — good enough to order by, not to display. Returns -1 for
 * anything unparseable (live "watching" counts, missing data) so those sort
 * last rather than jumping to the top.
 */
export function parseViewCount(text?: string): number {
  if (!text) return -1
  const match = text.replace(/,/g, '').match(/([\d.]+)\s*([KMB])?/i)
  if (!match) return -1
  const value = parseFloat(match[1])
  if (!Number.isFinite(value)) return -1
  const multiplier = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[
    match[2]?.toLowerCase() ?? ''
  ] ?? 1
  return Math.round(value * multiplier)
}

const RELATIVE_UNIT_MS: Record<string, number> = {
  second: 1_000,
  minute: 60_000,
  hour: 3_600_000,
  day: 86_400_000,
  week: 604_800_000,
  month: 2_629_800_000,  // average Gregorian month
  year: 31_557_600_000,
}

/**
 * Converts a relative upload label — "2 weeks ago", "1 month ago" — into
 * approximate milliseconds of age, for sorting by recency.
 *
 * Live streams ("Streamed 2 years ago") are handled by ignoring the prefix.
 * Returns Infinity when nothing parses, so unknown dates sort oldest.
 */
export function parseRelativeAge(text?: string): number {
  if (!text) return Infinity
  const match = text.match(/(\d+)\s*(second|minute|hour|day|week|month|year)/i)
  if (!match) return Infinity
  const unit = RELATIVE_UNIT_MS[match[2].toLowerCase()]
  return unit ? parseInt(match[1], 10) * unit : Infinity
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
