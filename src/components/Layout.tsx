import { NavLink, Outlet } from 'react-router-dom'
import { useTheme } from '../hooks/useTheme'

export default function Layout() {
  const { theme, toggle } = useTheme()

  return (
    <div className="app-shell">
      <nav className="sidebar">
        <NavLink to="/">Home</NavLink>
        <NavLink to="/subscriptions">Subscriptions</NavLink>
        <NavLink to="/settings">Settings</NavLink>
        <button className="theme-toggle" onClick={toggle} aria-label="Toggle theme">
          {theme === 'light' ? '🌙 Dark' : '☀️ Light'}
        </button>
      </nav>
      <div className="content">
        <Outlet />
      </div>
    </div>
  )
}
