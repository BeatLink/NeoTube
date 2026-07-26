import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route, Link } from 'react-router-dom'

vi.mock('../src/db/index', () => ({
  getSubscriptions: vi.fn().mockResolvedValue([]),
  subscribe: vi.fn(),
  getSettings: vi.fn().mockResolvedValue({ theme: 'system' }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('../src/services/metadata', () => ({
  getChannelInfoCached: vi.fn().mockResolvedValue({}),
}))
vi.mock('../src/utils/avatar', () => ({ downloadAvatar: vi.fn() }))

const Layout = (await import('../src/components/Layout/Layout')).default
const { ThemeProvider } = await import('../src/contexts/ThemeContext')

function renderApp() {
  return render(
    <ThemeProvider>
      <MemoryRouter initialEntries={['/tall']}>
        <Routes>
          <Route path="/" element={<Layout />}>
            <Route path="tall" element={<Link to="/short">go short</Link>} />
            <Route path="short" element={<p>short page</p>} />
          </Route>
        </Routes>
      </MemoryRouter>
    </ThemeProvider>,
  )
}

describe('scroll reset on navigation', () => {
  beforeEach(() => { vi.clearAllMocks() })

  // The layout is a fixed-height grid: `.content` scrolls, not the window.
  // React Router only resets window scroll, so without an explicit reset the
  // offset carries into the next page — and on a short page there is nothing
  // to scroll, leaving the user stuck below its content.
  it('returns the content container to the top when the route changes', async () => {
    const { container } = renderApp()
    const content = container.querySelector('.content') as HTMLElement
    expect(content).toBeTruthy()

    content.scrollTop = 500
    await userEvent.click(screen.getByText('go short'))

    await waitFor(() => expect(screen.getByText('short page')).toBeInTheDocument())
    expect(content.scrollTop).toBe(0)
  })

  it('scrolls the container rather than the window', async () => {
    const scrollTo = vi.fn()
    vi.stubGlobal('scrollTo', scrollTo)

    renderApp()
    await userEvent.click(screen.getByText('go short'))

    await waitFor(() => expect(screen.getByText('short page')).toBeInTheDocument())
    expect(scrollTo).not.toHaveBeenCalled()
    vi.unstubAllGlobals()
  })
})
