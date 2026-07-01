import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import App from '../App'

vi.mock('../db/index', () => ({
  getSettings: vi.fn().mockResolvedValue({ theme: 'system', _id: 'settings', type: 'settings', defaultQuality: 'best', privacyMode: true }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}))

describe('App', () => {
  it('renders the home page URL bar', () => {
    render(<App />)
    expect(screen.getByPlaceholderText(/paste a youtube url/i)).toBeInTheDocument()
  })

  it('renders navigation links', () => {
    render(<App />)
    expect(screen.getByText('Home')).toBeInTheDocument()
    expect(screen.getByText('Subscriptions')).toBeInTheDocument()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})
