import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

vi.mock('../db/index', () => ({
  getSettings: vi.fn().mockResolvedValue({ theme: 'system', _id: 'settings', type: 'settings', activePlugin: 'youtubejs', defaultQuality: 'best', privacyMode: true, watchedVideoStyle: 'normal' }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  getSubscriptions: vi.fn().mockResolvedValue([]),
  subscribe: vi.fn().mockResolvedValue(undefined),
  recordWatch: vi.fn().mockResolvedValue(undefined),
  getHistory: vi.fn().mockResolvedValue([]),
  getWatchedVideoIds: vi.fn().mockResolvedValue(new Set()),
  removeFromHistory: vi.fn().mockResolvedValue(undefined),
  clearHistory: vi.fn().mockResolvedValue(undefined),
}))

describe('App', () => {
  it('renders the topbar search input', () => {
    render(<App />)
    expect(screen.getByPlaceholderText(/search or paste a youtube url/i)).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(<App />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Subscriptions')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })

  it('renders the Search button in the topbar', () => {
    render(<App />)
    expect(screen.getByRole('button', { name: /search/i })).toBeInTheDocument()
  })
})
