import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'

const isSubscribed = vi.fn()
const subscribe = vi.fn().mockResolvedValue(undefined)
const unsubscribe = vi.fn().mockResolvedValue(undefined)
vi.mock('../src/db/index', () => ({ isSubscribed, subscribe, unsubscribe }))

const ChannelCard = (await import('../src/components/ChannelCard/ChannelCard')).default

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <MemoryRouter>{children}</MemoryRouter>
)

function renderCard(props: Partial<Parameters<typeof ChannelCard>[0]> = {}) {
  return render(
    <ChannelCard channelId="UC1" name="Cool Channel" avatar="https://x/a.jpg" {...props} />,
    { wrapper },
  )
}

describe('ChannelCard', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    isSubscribed.mockResolvedValue(false)
  })

  it('links to the channel page', async () => {
    renderCard()
    expect(screen.getByRole('link')).toHaveAttribute('href', '/channel/UC1')
  })

  it('shows Subscribe when not subscribed', async () => {
    renderCard()
    expect(await screen.findByText('Subscribe')).toBeInTheDocument()
  })

  it('shows Subscribed when already subscribed', async () => {
    isSubscribed.mockResolvedValue(true)
    renderCard()
    expect(await screen.findByText('Subscribed')).toBeInTheDocument()
  })

  it('subscribes on click, passing the avatar through', async () => {
    renderCard()
    await userEvent.click(await screen.findByRole('button', { name: /subscribe to/i }))

    expect(subscribe).toHaveBeenCalledWith('UC1', 'Cool Channel', 'https://x/a.jpg')
    expect(await screen.findByText('Subscribed')).toBeInTheDocument()
  })

  it('unsubscribes on click when already subscribed', async () => {
    isSubscribed.mockResolvedValue(true)
    renderCard()
    await userEvent.click(await screen.findByRole('button', { name: /unsubscribe from/i }))

    expect(unsubscribe).toHaveBeenCalledWith('UC1')
    expect(await screen.findByText('Subscribe')).toBeInTheDocument()
  })

  it('reports the new state to the parent', async () => {
    const onSubscriptionChange = vi.fn()
    renderCard({ onSubscriptionChange })
    await userEvent.click(await screen.findByRole('button', { name: /subscribe to/i }))

    expect(onSubscriptionChange).toHaveBeenCalledWith(true)
  })

  // The button would otherwise briefly read "Subscribe" for a channel the user
  // is already subscribed to.
  it('disables the button until the state is known', () => {
    isSubscribed.mockReturnValue(new Promise(() => {}))
    renderCard()
    expect(screen.getByRole('button')).toBeDisabled()
  })

  it('keeps the previous state when the write fails', async () => {
    subscribe.mockRejectedValueOnce(new Error('db down'))
    renderCard()
    await userEvent.click(await screen.findByRole('button', { name: /subscribe to/i }))

    await waitFor(() => expect(screen.getByText('Subscribe')).toBeInTheDocument())
  })

  it('falls back to an initial when there is no avatar', async () => {
    renderCard({ avatar: undefined })
    expect(screen.getByText('C')).toBeInTheDocument()
  })
})
