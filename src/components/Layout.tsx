import { useState } from 'react'
import { NavLink, Outlet, useNavigate } from 'react-router-dom'
import { useTheme } from '../contexts/ThemeContext'
import { parseVideoId } from '../utils/youtube'

export default function Layout() {
  const { theme, toggle } = useTheme()
  const navigate = useNavigate()
  const [query, setQuery] = useState('')

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
        <NavLink to="/">Home</NavLink>
        <NavLink to="/subscriptions">Subscriptions</NavLink>
        <NavLink to="/settings">Settings</NavLink>
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
