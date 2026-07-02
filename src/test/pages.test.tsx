import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../contexts/ThemeContext'
import Home from '../pages/Home'
import Subscriptions from '../pages/Channels'
import Settings from '../pages/Settings'
import Watch from '../pages/Watch'
import Search from '../pages/Search'
import Channel from '../pages/Channel'
import { isSubscribed, subscribe, unsubscribe, getSubscriptions } from '../db/index'

// ─── Shared mocks ─────────────────────────────────────────────────────────────

const MOCK_VIDEO_INFO = {
  videoId: 'dQw4w9WgXcQ',
  title: 'Never Gonna Give You Up',
  channelName: 'Rick Astley',
  channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
  description: '',
  duration: 213,
  thumbnail: '',
  publishedAt: '',
  streams: [],
}

const MOCK_CHANNEL_INFO = {
  channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
  name: 'Rick Astley',
  avatar: '',
  description: 'Official Rick Astley channel',
  subscriberCount: 4000000,
}

const MOCK_SEARCH_RESULTS = [
  { videoId: 'abc123', title: 'Cool Video', channelId: 'ch1', channelName: 'Cool Channel', thumbnail: '', duration: 120 },
  { videoId: 'def456', title: 'Another Video', channelId: 'ch2', channelName: 'Another Channel', thumbnail: '', duration: 240 },
]

vi.mock('../plugins/manager', () => {
  // Stable shared object so vi.mocked(pluginManager.getActive().search)
  // always refers to the same vi.fn() that the component calls.
  const _plugin = {
    id: 'youtubejs',
    getVideoInfo: vi.fn().mockResolvedValue({
      videoId: 'dQw4w9WgXcQ',
      title: 'Never Gonna Give You Up',
      channelName: 'Rick Astley',
      channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
      description: '', duration: 213, thumbnail: '', publishedAt: '', streams: [],
    }),
    search: vi.fn().mockResolvedValue([
      { videoId: 'abc123', title: 'Cool Video', channelId: 'ch1', channelName: 'Cool Channel', thumbnail: '', duration: 120 },
      { videoId: 'def456', title: 'Another Video', channelId: 'ch2', channelName: 'Another Channel', thumbnail: '', duration: 240 },
    ]),
    getChannelInfo: vi.fn().mockResolvedValue({
      channelId: 'UCuAXFkgsw1L7xaCfnd5JJOw',
      name: 'Rick Astley',
      avatar: '',
      description: 'Official Rick Astley channel',
      subscriberCount: 4000000,
    }),
  }
  return {
    pluginManager: {
      getActive: vi.fn(() => _plugin),
      list: vi.fn(() => [
        { id: 'youtubejs', name: 'youtube.js (Local)', description: 'Works in Electron' },
        { id: 'ytdlp', name: 'yt-dlp', description: 'Desktop only' },
      ]),
      setActive: vi.fn(),
    },
  }
})

vi.mock('../services/videoCache', () => ({
  getOrFetchChannelVideos: vi.fn().mockResolvedValue(null),
  refreshChannelVideos: vi.fn().mockResolvedValue([]),
  cacheHistoryThumbnails: vi.fn().mockResolvedValue(undefined),
}))

// Inline vi.fn() — must not reference outer variables (vi.mock is hoisted)
vi.mock('../db/index', () => ({
  getSettings: vi.fn().mockResolvedValue({ theme: 'system', _id: 'settings', type: 'settings', activePlugin: 'youtubejs', defaultQuality: 'best', privacyMode: true, watchedVideoStyle: 'normal', feedSortMode: 'channel', feedHideWatched: false, channelsHideWatched: false, channelPageHideWatched: false }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  isSubscribed: vi.fn().mockResolvedValue(false),
  subscribe: vi.fn().mockResolvedValue(undefined),
  unsubscribe: vi.fn().mockResolvedValue(undefined),
  getSubscriptions: vi.fn().mockResolvedValue([]),
  recordWatch: vi.fn().mockResolvedValue(undefined),
  getHistory: vi.fn().mockResolvedValue([]),
  getWatchedVideoIds: vi.fn().mockResolvedValue(new Set()),
  removeFromHistory: vi.fn().mockResolvedValue(undefined),
  clearHistory: vi.fn().mockResolvedValue(undefined),
  updateHistoryThumbnail: vi.fn().mockResolvedValue(undefined),
  getCachedChannelVideos: vi.fn().mockResolvedValue(null),
  setCachedChannelVideos: vi.fn().mockResolvedValue(undefined),
  getAllCachedChannelVideos: vi.fn().mockResolvedValue(new Map()),
}))

// Typed references to the mocked functions
const mockIsSubscribed = vi.mocked(isSubscribed)
const mockSubscribe = vi.mocked(subscribe)
const mockUnsubscribe = vi.mocked(unsubscribe)
const mockGetSubscriptions = vi.mocked(getSubscriptions)

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <ThemeProvider><MemoryRouter>{children}</MemoryRouter></ThemeProvider>
)

// ─── Home ─────────────────────────────────────────────────────────────────────

describe('Home page', () => {
  it('renders welcome heading', () => {
    render(<Home />, { wrapper })
    expect(screen.getByRole('heading', { name: /neotube/i })).toBeInTheDocument()
  })

  it('renders instructions text', () => {
    render(<Home />, { wrapper })
    expect(screen.getByText(/search for videos/i)).toBeInTheDocument()
  })
})

// ─── Search ───────────────────────────────────────────────────────────────────

describe('Search page', () => {
  function renderSearch(query: string) {
    return render(
      <ThemeProvider>
        <MemoryRouter initialEntries={[`/search?q=${encodeURIComponent(query)}`]}>
          <Routes><Route path="/search" element={<Search />} /></Routes>
        </MemoryRouter>
      </ThemeProvider>
    )
  }

  it('shows hint when no query is provided', () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/search']}>
          <Routes><Route path="/search" element={<Search />} /></Routes>
        </MemoryRouter>
      </ThemeProvider>
    )
    expect(screen.getByText(/enter a search term/i)).toBeInTheDocument()
  })

  it('shows loading state while searching', async () => {
    const { pluginManager } = await import('../plugins/manager')
    vi.mocked(pluginManager.getActive().search).mockReturnValueOnce(new Promise(() => {}))
    renderSearch('cats')
    expect(screen.getByText(/searching/i)).toBeInTheDocument()
  })

  it('renders search results', async () => {
    renderSearch('cool video')
    expect(await screen.findByText('Cool Video')).toBeInTheDocument()
    expect(screen.getByText('Another Video')).toBeInTheDocument()
  })

  it('each result title links to the watch page', async () => {
    renderSearch('cool video')
    const links = await screen.findAllByRole('link')
    expect(links.some(l => l.getAttribute('href') === '/watch/abc123')).toBe(true)
  })

  it('channel name links to the channel page', async () => {
    renderSearch('cool video')
    const links = await screen.findAllByRole('link')
    expect(links.some(l => l.getAttribute('href') === '/channel/ch1')).toBe(true)
  })

  it('shows error message when search fails', async () => {
    const { pluginManager } = await import('../plugins/manager')
    vi.mocked(pluginManager.getActive().search).mockRejectedValueOnce(new Error('Network error'))
    renderSearch('failing query')
    expect(await screen.findByText(/network error/i)).toBeInTheDocument()
  })
})

// ─── Watch ────────────────────────────────────────────────────────────────────

describe('Watch page', () => {
  function renderWatch(videoId: string) {
    return render(
      <ThemeProvider>
        <MemoryRouter initialEntries={[`/watch/${videoId}`]}>
          <Routes><Route path="/watch/:videoId" element={<Watch />} /></Routes>
        </MemoryRouter>
      </ThemeProvider>
    )
  }

  it('shows loading state initially', async () => {
    const { pluginManager } = await import('../plugins/manager')
    vi.mocked(pluginManager.getActive().getVideoInfo).mockReturnValueOnce(new Promise(() => {}))
    renderWatch('abc123')
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })

  it('renders video title and channel after loading', async () => {
    renderWatch('dQw4w9WgXcQ')
    expect(await screen.findByText('Never Gonna Give You Up')).toBeInTheDocument()
    expect(screen.getByText('Rick Astley')).toBeInTheDocument()
  })

  it('shows Subscribe button when not subscribed', async () => {
    mockIsSubscribed.mockResolvedValueOnce(false)
    renderWatch('dQw4w9WgXcQ')
    expect(await screen.findByRole('button', { name: /^subscribe$/i })).toBeInTheDocument()
  })

  it('shows Subscribed button when already subscribed', async () => {
    mockIsSubscribed.mockResolvedValueOnce(true)
    renderWatch('dQw4w9WgXcQ')
    expect(await screen.findByRole('button', { name: /subscribed/i })).toBeInTheDocument()
  })

  it('calls subscribe when Subscribe button is clicked', async () => {
    mockIsSubscribed.mockResolvedValueOnce(false)
    renderWatch('dQw4w9WgXcQ')
    const btn = await screen.findByRole('button', { name: /^subscribe$/i })
    await userEvent.click(btn)
    expect(mockSubscribe).toHaveBeenCalledWith('UCuAXFkgsw1L7xaCfnd5JJOw', 'Rick Astley')
  })

  it('channel name links to the channel page', async () => {
    renderWatch('dQw4w9WgXcQ')
    await waitFor(() => screen.getByText('Rick Astley'))
    const channelLink = screen.getByRole('link', { name: 'Rick Astley' })
    expect(channelLink.getAttribute('href')).toBe('/channel/UCuAXFkgsw1L7xaCfnd5JJOw')
  })
})

// ─── Subscriptions ────────────────────────────────────────────────────────────

describe('Subscriptions page', () => {
  it('shows empty state when no subscriptions', async () => {
    render(<Subscriptions />, { wrapper })
    expect(await screen.findByText(/haven't subscribed/i)).toBeInTheDocument()
  })

  it('lists subscribed channels', async () => {
    mockGetSubscriptions.mockResolvedValueOnce([
      { _id: 'sub-UC1', type: 'subscription', channelId: 'UC1', channelName: 'Cool Channel', subscribedAt: '2024-01-01T00:00:00Z' },
      { _id: 'sub-UC2', type: 'subscription', channelId: 'UC2', channelName: 'Another Channel', subscribedAt: '2024-01-02T00:00:00Z' },
    ])
    render(<Subscriptions />, { wrapper })
    expect(await screen.findByText('Cool Channel')).toBeInTheDocument()
    expect(screen.getByText('Another Channel')).toBeInTheDocument()
  })

  it('each channel links to the channel page', async () => {
    mockGetSubscriptions.mockResolvedValueOnce([
      { _id: 'sub-UC1', type: 'subscription', channelId: 'UC1', channelName: 'Cool Channel', subscribedAt: '2024-01-01T00:00:00Z' },
    ])
    render(<Subscriptions />, { wrapper })
    const link = await screen.findByRole('link', { name: 'Cool Channel' })
    expect(link.getAttribute('href')).toBe('/channel/UC1')
  })

  it('Unsubscribe button removes the channel from the list', async () => {
    mockGetSubscriptions.mockResolvedValueOnce([
      { _id: 'sub-UC1', type: 'subscription', channelId: 'UC1', channelName: 'Cool Channel', subscribedAt: '2024-01-01T00:00:00Z' },
    ])
    render(<Subscriptions />, { wrapper })
    const btn = await screen.findByRole('button', { name: /unsubscribe from Cool Channel/i })
    await userEvent.click(btn)
    expect(mockUnsubscribe).toHaveBeenCalledWith('UC1')
    expect(screen.queryByText('Cool Channel')).not.toBeInTheDocument()
  })
})

// ─── Channel ──────────────────────────────────────────────────────────────────

describe('Channel page', () => {
  function renderChannel(channelId: string) {
    return render(
      <ThemeProvider>
        <MemoryRouter initialEntries={[`/channel/${channelId}`]}>
          <Routes><Route path="/channel/:channelId" element={<Channel />} /></Routes>
        </MemoryRouter>
      </ThemeProvider>
    )
  }

  it('shows loading state initially', async () => {
    const { pluginManager } = await import('../plugins/manager')
    vi.mocked(pluginManager.getActive().getChannelInfo).mockReturnValueOnce(new Promise(() => {}))
    renderChannel('UCuAXFkgsw1L7xaCfnd5JJOw')
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })

  it('renders channel name and subscriber count', async () => {
    renderChannel('UCuAXFkgsw1L7xaCfnd5JJOw')
    expect(await screen.findByText('Rick Astley')).toBeInTheDocument()
    expect(screen.getByText(/4,000,000 subscribers/i)).toBeInTheDocument()
  })

  it('shows Subscribe button when not subscribed', async () => {
    mockIsSubscribed.mockResolvedValueOnce(false)
    renderChannel('UCuAXFkgsw1L7xaCfnd5JJOw')
    expect(await screen.findByRole('button', { name: /^subscribe$/i })).toBeInTheDocument()
  })
})

// ─── Settings ─────────────────────────────────────────────────────────────────

describe('Settings page', () => {
  it('renders theme options', () => {
    render(<Settings />, { wrapper })
    expect(screen.getByText(/light/i)).toBeInTheDocument()
    expect(screen.getByText(/dark/i)).toBeInTheDocument()
  })

  it('renders plugin options', () => {
    render(<Settings />, { wrapper })
    expect(screen.getByText('youtube.js (Local)')).toBeInTheDocument()
    expect(screen.getByText('yt-dlp')).toBeInTheDocument()
  })

  it('calls setActive when a plugin is selected', async () => {
    const { pluginManager } = await import('../plugins/manager')
    render(<Settings />, { wrapper })
    await userEvent.click(screen.getByDisplayValue('ytdlp'))
    expect(pluginManager.setActive).toHaveBeenCalledWith('ytdlp')
  })
})

// suppress unused var warnings — these are the raw mock data used for reference
void MOCK_VIDEO_INFO; void MOCK_CHANNEL_INFO; void MOCK_SEARCH_RESULTS
