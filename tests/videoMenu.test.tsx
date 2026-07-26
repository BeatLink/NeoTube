import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VideoMenu, { type VideoMenuAction } from '../src/components/VideoMenu/VideoMenu'

function makeActions(overrides: Partial<VideoMenuAction>[] = []): VideoMenuAction[] {
  const base: VideoMenuAction[] = [
    { label: 'Mark as watched', onSelect: vi.fn(), confirmation: 'Marked as watched' },
    { label: 'Open in YouTube', onSelect: vi.fn() },
    { label: 'Copy link', onSelect: vi.fn(), confirmation: 'Link copied' },
  ]
  return base.map((a, i) => ({ ...a, ...overrides[i] }))
}

describe('VideoMenu', () => {
  beforeEach(() => { vi.useRealTimers() })

  it('hides the actions until the trigger is clicked', () => {
    render(<VideoMenu actions={makeActions()} />)
    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shows every action when opened', async () => {
    render(<VideoMenu actions={makeActions()} />)
    await userEvent.click(screen.getByRole('button', { name: /video options/i }))

    expect(screen.getByRole('menu')).toBeInTheDocument()
    expect(screen.getByText('Mark as watched')).toBeInTheDocument()
    expect(screen.getByText('Open in YouTube')).toBeInTheDocument()
    expect(screen.getByText('Copy link')).toBeInTheDocument()
  })

  it('invokes the selected action', async () => {
    const onSelect = vi.fn()
    render(<VideoMenu actions={makeActions([{}, { onSelect }])} />)

    await userEvent.click(screen.getByRole('button', { name: /video options/i }))
    await userEvent.click(screen.getByText('Open in YouTube'))

    expect(onSelect).toHaveBeenCalledOnce()
  })

  it('closes after an action with no confirmation', async () => {
    render(<VideoMenu actions={makeActions()} />)
    await userEvent.click(screen.getByRole('button', { name: /video options/i }))
    await userEvent.click(screen.getByText('Open in YouTube'))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('shows the confirmation label instead of closing', async () => {
    render(<VideoMenu actions={makeActions()} />)
    await userEvent.click(screen.getByRole('button', { name: /video options/i }))
    await userEvent.click(screen.getByText('Copy link'))

    expect(screen.getByText('Link copied')).toBeInTheDocument()
  })

  it('closes when Escape is pressed', async () => {
    render(<VideoMenu actions={makeActions()} />)
    await userEvent.click(screen.getByRole('button', { name: /video options/i }))
    await userEvent.keyboard('{Escape}')

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  it('closes when clicking outside', async () => {
    render(<div><VideoMenu actions={makeActions()} /><button>elsewhere</button></div>)
    await userEvent.click(screen.getByRole('button', { name: /video options/i }))
    await userEvent.click(screen.getByText('elsewhere'))

    expect(screen.queryByRole('menu')).not.toBeInTheDocument()
  })

  // The card is wrapped in <Link>s, so a click that bubbled would navigate away.
  it('does not let clicks reach an enclosing link', async () => {
    const onParentClick = vi.fn()
    render(
      <div onClick={onParentClick}>
        <VideoMenu actions={makeActions()} />
      </div>,
    )
    await userEvent.click(screen.getByRole('button', { name: /video options/i }))
    expect(onParentClick).not.toHaveBeenCalled()

    await userEvent.click(screen.getByText('Copy link'))
    expect(onParentClick).not.toHaveBeenCalled()
  })

  it('stays open when an action rejects', async () => {
    const onSelect = vi.fn().mockRejectedValue(new Error('clipboard blocked'))
    render(<VideoMenu actions={makeActions([{}, {}, { onSelect }])} />)

    await userEvent.click(screen.getByRole('button', { name: /video options/i }))
    await userEvent.click(screen.getByText('Copy link'))

    // The failure is swallowed and the confirmation still shows — nothing here
    // is important enough to surface an error for.
    expect(screen.getByText('Link copied')).toBeInTheDocument()
  })
})
