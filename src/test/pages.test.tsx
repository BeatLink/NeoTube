import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import Home from '../pages/Home'
import Subscriptions from '../pages/Subscriptions'
import Settings from '../pages/Settings'
import Watch from '../pages/Watch'

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
  it('renders video id from route param', () => {
    render(
      <MemoryRouter initialEntries={['/watch/abc123']}>
        <Routes>
          <Route path="/watch/:videoId" element={<Watch />} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByText(/abc123/)).toBeInTheDocument()
  })
})
