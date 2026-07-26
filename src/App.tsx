import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import Layout from './components/Layout'
import Watch from './pages/Watch'
import Search from './pages/Search'
import Channel from './pages/Channel'
import Subscriptions from './pages/Subscriptions'
import Channels from './pages/Channels'
import History from './pages/History'
import Settings from './pages/Settings'
import { getSettings } from './db'
import type { StartupPage } from './types'
import { setCookie as ytjsSetCookie } from './plugins/youtubejs/innertube'
import './App.css'

export default function App() {
  // null until settings load, so we don't redirect to the wrong page first.
  const [startupPage, setStartupPage] = useState<StartupPage | null>(null)

  useEffect(() => {
    getSettings().then(s => {
      if (s.ytCookie) ytjsSetCookie(s.ytCookie)
      setStartupPage(s.startupPage ?? 'subscriptions')
    }).catch(() => setStartupPage('subscriptions'))
  }, [])

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route
              index
              element={
                startupPage
                  ? <Navigate to={`/${startupPage}`} replace />
                  : null
              }
            />
            <Route path="watch/:videoId" element={<Watch />} />
            <Route path="search" element={<Search />} />
            <Route path="channel/:channelId" element={<Channel />} />
            <Route path="subscriptions" element={<Subscriptions />} />
            <Route path="channels" element={<Channels />} />
            <Route path="history" element={<History />} />
            <Route path="settings" element={<Settings />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </ThemeProvider>
  )
}
