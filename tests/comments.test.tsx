import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'

const getComments = vi.fn()
vi.mock('../src/plugins/manager', () => ({
  pluginManager: { getActive: () => ({ getComments }) },
}))

const Comments = (await import('../src/components/Comments/Comments')).default

function comment(overrides: Record<string, unknown> = {}) {
  return {
    commentId: 'c1',
    author: '@someone',
    authorAvatar: 'https://x/a.jpg',
    authorIsOwner: false,
    text: 'Nice video',
    likeCount: '272K',
    publishedText: '1 year ago',
    replyCount: '961',
    isPinned: false,
    ...overrides,
  }
}

describe('Comments', () => {
  beforeEach(() => vi.clearAllMocks())

  it('renders each comment with its author and text', async () => {
    getComments.mockResolvedValue({
      totalText: '2 Comments',
      comments: [comment(), comment({ commentId: 'c2', author: '@other', text: 'Second' })],
    })
    render(<Comments videoId="v1" />)

    expect(await screen.findByText('Nice video')).toBeInTheDocument()
    expect(screen.getByText('Second')).toBeInTheDocument()
    expect(screen.getByText('@someone')).toBeInTheDocument()
  })

  it('shows the total from YouTube as the heading', async () => {
    getComments.mockResolvedValue({ totalText: '2,445,333 Comments', comments: [comment()] })
    render(<Comments videoId="v1" />)
    expect(await screen.findByText('2,445,333 Comments')).toBeInTheDocument()
  })

  it('shows like and reply counts', async () => {
    getComments.mockResolvedValue({ totalText: '', comments: [comment()] })
    render(<Comments videoId="v1" />)
    expect(await screen.findByText(/272K/)).toBeInTheDocument()
    expect(screen.getByText('961 replies')).toBeInTheDocument()
  })

  it('marks the uploader\'s own comment', async () => {
    getComments.mockResolvedValue({
      totalText: '', comments: [comment({ authorIsOwner: true, author: '@creator' })],
    })
    render(<Comments videoId="v1" />)
    expect((await screen.findByText('@creator')).className).toContain('comment-author-owner')
  })

  it('reports an empty thread rather than rendering nothing', async () => {
    getComments.mockResolvedValue({ totalText: '', comments: [] })
    render(<Comments videoId="v1" />)
    expect(await screen.findByText('No comments.')).toBeInTheDocument()
  })

  // Comments are secondary; a failure must not take the watch page with it.
  it('degrades quietly when the fetch fails', async () => {
    getComments.mockRejectedValue(new Error('comments disabled'))
    render(<Comments videoId="v1" />)
    expect(await screen.findByText('No comments.')).toBeInTheDocument()
  })

  it('refetches when the video changes', async () => {
    getComments.mockResolvedValue({ totalText: '', comments: [comment()] })
    const { rerender } = render(<Comments videoId="v1" />)
    await screen.findByText('Nice video')

    rerender(<Comments videoId="v2" />)
    expect(getComments).toHaveBeenCalledWith('v2')
  })
})
