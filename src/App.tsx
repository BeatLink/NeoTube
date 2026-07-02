import { useEffect } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { ThemeProvider } from './contexts/ThemeContext'
import Layout from './components/Layout'
import Home from './pages/Home'
import Watch from './pages/Watch'
import Search from './pages/Search'
import Channel from './pages/Channel'
import Subscriptions from './pages/Subscriptions'
import Channels from './pages/Channels'
import History from './pages/History'
import Settings from './pages/Settings'
import { getSettings } from './db'
import './App.css'

export default function App() {
  useEffect(() => {
    if (!window.ytjs?.setCookie) return
    getSettings().then(s => {
      window.ytjs?.setCookie(s.ytCookie ?? '')
    }).catch(() => {})
  }, [])

  return (
    <ThemeProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route index element={<Home />} />
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
