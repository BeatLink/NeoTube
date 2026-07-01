import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Home from '../pages/Home'
import Subscriptions from '../pages/Subscriptions'
import Settings from '../pages/Settings'
import Watch from '../pages/Watch'

vi.mock('../plugins/manager', () => ({
  pluginManager: {
    getActive: () => ({
      getVideoInfo: vi.fn().mockResolvedValue({
        videoId: 'abc123',
        title: 'Test Video',
        channelName: 'Test Channel',
        description: '',
        duration: 100,
        thumbnail: '',
        publishedAt: '',
        streams: [],
      }),
    }),
  },
}))

vi.mock('../db/index', () => ({
  getSettings: vi.fn().mockResolvedValue({ theme: 'system', _id: 'settings', type: 'settings', defaultQuality: 'best', privacyMode: true }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}))

describe('Home page', () => {
  it('renders welcome text', () => {
    render(<Home />, { wrapper: MemoryRouter })
    expect(screen.getByText('NeoTube')).toBeInTheDocument()
  })
})

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
