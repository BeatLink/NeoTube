import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Home from '../pages/Home'
import Subscriptions from '../pages/Subscriptions'
import Settings from '../pages/Settings'
import Watch from '../pages/Watch'

const MOCK_VIDEO_INFO = {
  videoId: 'dQw4w9WgXcQ',
  title: 'Never Gonna Give You Up',
  channelName: 'Rick Astley',
  description: '',
  duration: 213,
  thumbnail: '',
  publishedAt: '',
  streams: [],
}

const mockGetVideoInfo = vi.fn().mockResolvedValue(MOCK_VIDEO_INFO)

vi.mock('../plugins/manager', () => ({
  pluginManager: {
    getActive: () => ({ getVideoInfo: mockGetVideoInfo }),
  },
}))

vi.mock('../db/index', () => ({
  getSettings: vi.fn().mockResolvedValue({ theme: 'system', _id: 'settings', type: 'settings', defaultQuality: 'best', privacyMode: true }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}))

// ─── Home ─────────────────────────────────────────────────────────────────────

describe('Home page', () => {
  it('renders the URL input and Play button', () => {
    render(<Home />, { wrapper: MemoryRouter })
    expect(screen.getByPlaceholderText(/paste a youtube url/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /play/i })).toBeInTheDocument()
  })

  it('shows an error for an unrecognised URL', async () => {
    render(<Home />, { wrapper: MemoryRouter })
    await userEvent.type(screen.getByPlaceholderText(/paste a youtube url/i), 'https://vimeo.com/123')
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(await screen.findByText(/not a recognised youtube url/i)).toBeInTheDocument()
  })

  it('calls getVideoInfo with the parsed video ID on submit', async () => {
    render(<Home />, { wrapper: MemoryRouter })
    await userEvent.type(screen.getByPlaceholderText(/paste a youtube url/i), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ')
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    await waitFor(() => expect(mockGetVideoInfo).toHaveBeenCalledWith('dQw4w9WgXcQ'))
  })

  it('renders video title and channel after successful load', async () => {
    render(<Home />, { wrapper: MemoryRouter })
    await userEvent.type(screen.getByPlaceholderText(/paste a youtube url/i), 'https://youtu.be/dQw4w9WgXcQ')
    fireEvent.click(screen.getByRole('button', { name: /play/i }))
    expect(await screen.findByText('Never Gonna Give You Up')).toBeInTheDocument()
    expect(await screen.findByText('Rick Astley')).toBeInTheDocument()
  })
})

// ─── Other pages ──────────────────────────────────────────────────────────────

describe('Subscriptions page', () => {
  it('renders heading', () => {
    render(<Subscriptions />, { wrapper: MemoryRouter })
    expect(screen.getByText('Subscriptions')).toBeInTheDocument()
  })
})

describe('Settings page', () => {
  it('renders heading', () => {
    render(<Settings />, { wrapper: MemoryRouter })
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})

describe('Watch page', () => {
  it('shows loading state initially', () => {
    render(
      <MemoryRouter initialEntries={['/watch/abc123']}>
        <Routes>
          <Route path="/watch/:videoId" element={<Watch />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText(/Loading/i)).toBeInTheDocument()
  })
})
