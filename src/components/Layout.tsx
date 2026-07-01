import { NavLink, Outlet } from 'react-router-dom'

export default function Layout() {
  return (
    <div className="app-shell">
      <nav className="sidebar">
        <NavLink to="/">Home</NavLink>
        <NavLink to="/subscriptions">Subscriptions</NavLink>
        <NavLink to="/settings">Settings</NavLink>
      </nav>
      <div className="content">
        <Outlet />
      </div>
    </div>
  )
}
