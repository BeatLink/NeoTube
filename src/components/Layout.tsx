import { useState, useEffect, useCallback } from 'react'
import { NavLink, Outlet, useNavigate, Link } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { parseVideoId } from '../utils/youtube'
import { getSubscriptions, subscribe } from '../db/index'
import { pluginManager } from '../plugins/manager'
import type { Subscription } from '../types'

export default function Layout() {
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [subs, setSubs] = useState<Subscription[]>([])

  const loadSubs = useCallback(() => {
    getSubscriptions().then(setSubs).catch(() => {})
  }, [])

  useEffect(() => {
    loadSubs()
    window.addEventListener('subscriptions-changed', loadSubs)
    return () => window.removeEventListener('subscriptions-changed', loadSubs)
  }, [loadSubs])

  // On startup, backfill avatars for any subscriptions that were saved without one.
  // Runs sequentially so we don't fire N channel-info requests simultaneously.
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const list = await getSubscriptions()
      const missing = list.filter(s => !s.avatar)
      if (!missing.length) return
      let plugin
      try { plugin = pluginManager.getActive() } catch { return }
      for (const sub of missing) {
        if (cancelled) break
        try {
          const info = await plugin.getChannelInfo(sub.channelId)
          if (info.avatar && !cancelled) {
            await subscribe(sub.channelId, sub.channelName, info.avatar)
            // subscriptions-changed is dispatched by subscribe(), so the sidebar
            // will re-render with the new avatar after each one is resolved.
          }
        } catch { /* skip unreachable channels */ }
      }
    })()
    return () => { cancelled = true }
  }, [])

  function submit(input: string) {
    const trimmed = input.trim()
    if (!trimmed) return
    const videoId = parseVideoId(trimmed)
    if (videoId) {
      navigate(`/watch/${videoId}`)
    } else {
      navigate(`/search?q=${encodeURIComponent(trimmed)}`)
    }
    setQuery('')
  }

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <div className="sidebar-nav">
          <NavLink to="/">Home</NavLink>
          <NavLink to="/subscriptions">Subscriptions</NavLink>
          <NavLink to="/settings">Settings</NavLink>
        </div>

        {subs.length > 0 && (
          <>
            <div className="sidebar-divider" />
            <p className="sidebar-subs-label">Channels</p>
            <div className="sidebar-subs">
              {subs.map(sub => (
                <Link key={sub.channelId} to={`/channel/${sub.channelId}`} className="sidebar-sub-item">
                  {sub.avatar
                    ? <img className="sidebar-sub-avatar" src={sub.avatar} alt="" loading="lazy" />
                    : <div className="sidebar-sub-avatar sidebar-sub-avatar-initial">
                        {sub.channelName.charAt(0).toUpperCase()}
                      </div>
                  }
                  <span className="sidebar-sub-name">{sub.channelName}</span>
                </Link>
              ))}
            </div>
          </>
        )}
      </nav>

      <header className="topbar">
        <form className="topbar-search" onSubmit={e => { e.preventDefault(); submit(query) }}>
          <input
            className="topbar-input"
            type="search"
            placeholder="Search or paste a YouTube URL…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onPaste={e => {
              const pasted = e.clipboardData.getData('text')
              if (parseVideoId(pasted)) { e.preventDefault(); submit(pasted) }
            }}
            aria-label="Search"
          />
          <button className="topbar-submit" type="submit">Search</button>
        </form>
        <button className="theme-toggle topbar-theme" onClick={toggle} aria-label="Toggle theme">
          {theme === 'light' ? '🌙' : '☀️'}
        </button>
      </header>

      <div className="content">
        <Outlet />
      </div>
    </div>
  )
}
