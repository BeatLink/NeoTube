import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ThemeProvider } from '../contexts/ThemeContext'
import Home from '../pages/Home'
import Subscriptions from '../pages/Subscriptions'
import Settings from '../pages/Settings'
import Watch from '../pages/Watch'
import Search from '../pages/Search'

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

const MOCK_SEARCH_RESULTS = [
  { videoId: 'abc123', title: 'Cool Video', channelId: 'ch1', channelName: 'Cool Channel', thumbnail: '', duration: 120 },
  { videoId: 'def456', title: 'Another Video', channelId: 'ch2', channelName: 'Another Channel', thumbnail: '', duration: 240 },
]

const mockGetVideoInfo = vi.fn().mockResolvedValue(MOCK_VIDEO_INFO)
const mockSearch = vi.fn().mockResolvedValue(MOCK_SEARCH_RESULTS)

vi.mock('../plugins/manager', () => ({
  pluginManager: {
    getActive: vi.fn(() => ({ id: 'youtubejs', getVideoInfo: mockGetVideoInfo, search: mockSearch })),
    list: vi.fn(() => [
      { id: 'youtubejs', name: 'youtube.js (Local)', description: 'Works in Electron' },
      { id: 'ytdlp', name: 'yt-dlp', description: 'Desktop only' },
    ]),
    setActive: vi.fn(),
  },
}))

vi.mock('../db/index', () => ({
  getSettings: vi.fn().mockResolvedValue({ theme: 'system', _id: 'settings', type: 'settings', activePlugin: 'youtubejs', defaultQuality: 'best', privacyMode: true }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}))

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
          <Routes>
            <Route path="/search" element={<Search />} />
          </Routes>
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

  it('shows loading state while searching', () => {
    mockSearch.mockReturnValueOnce(new Promise(() => {}))
    renderSearch('cats')
    expect(screen.getByText(/searching/i)).toBeInTheDocument()
  })

  it('renders search results', async () => {
    renderSearch('cool video')
    expect(await screen.findByText('Cool Video')).toBeInTheDocument()
    expect(screen.getByText('Another Video')).toBeInTheDocument()
  })

  it('each result links to the watch page', async () => {
    renderSearch('cool video')
    const links = await screen.findAllByRole('link')
    expect(links.some(l => l.getAttribute('href') === '/watch/abc123')).toBe(true)
    expect(links.some(l => l.getAttribute('href') === '/watch/def456')).toBe(true)
  })

  it('shows channel names in results', async () => {
    renderSearch('cool video')
    expect(await screen.findByText('Cool Channel')).toBeInTheDocument()
    expect(screen.getByText('Another Channel')).toBeInTheDocument()
  })

  it('shows error message when search fails', async () => {
    mockSearch.mockRejectedValueOnce(new Error('Network error'))
    renderSearch('failing query')
    expect(await screen.findByText(/network error/i)).toBeInTheDocument()
  })
})

// ─── Subscriptions ────────────────────────────────────────────────────────────

describe('Subscriptions page', () => {
  it('renders heading', () => {
    render(<Subscriptions />, { wrapper })
    expect(screen.getByText('Subscriptions')).toBeInTheDocument()
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
    const ytdlpRadio = screen.getByDisplayValue('ytdlp')
    await userEvent.click(ytdlpRadio)
    expect(pluginManager.setActive).toHaveBeenCalledWith('ytdlp')
  })
})

// ─── Watch ────────────────────────────────────────────────────────────────────

describe('Watch page', () => {
  it('shows loading state initially', () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/watch/abc123']}>
          <Routes>
            <Route path="/watch/:videoId" element={<Watch />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    )
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })

  it('renders video info after loading', async () => {
    render(
      <ThemeProvider>
        <MemoryRouter initialEntries={['/watch/dQw4w9WgXcQ']}>
          <Routes>
            <Route path="/watch/:videoId" element={<Watch />} />
          </Routes>
        </MemoryRouter>
      </ThemeProvider>
    )
    await waitFor(() => expect(screen.getByText('Never Gonna Give You Up')).toBeInTheDocument())
    expect(screen.getByText('Rick Astley')).toBeInTheDocument()
  })
})
