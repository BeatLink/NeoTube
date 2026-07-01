import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

vi.mock('../db/index', () => ({
  getSettings: vi.fn().mockResolvedValue({ theme: 'system', _id: 'settings', type: 'settings', activePlugin: 'youtubejs', defaultQuality: 'best', privacyMode: true }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
  getSubscriptions: vi.fn().mockResolvedValue([]),
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
