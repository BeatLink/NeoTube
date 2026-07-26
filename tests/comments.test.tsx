import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const getComments = vi.fn()
const getCommentReplies = vi.fn()
vi.mock('../src/plugins/manager', () => ({
  pluginManager: { getActive: () => ({ getComments, getCommentReplies }) },
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
    hasReplies: true,
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
    expect(screen.getByText(/961 replies/)).toBeInTheDocument()
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

  describe('replies', () => {
    const reply = { ...comment({ commentId: 'r1', author: '@replier', text: 'A reply' }), hasReplies: false, replyCount: '' }

    it('does not fetch replies until asked', async () => {
      getComments.mockResolvedValue({ totalText: '', comments: [comment()] })
      render(<Comments videoId="v1" />)
      await screen.findByText('Nice video')
      expect(getCommentReplies).not.toHaveBeenCalled()
    })

    it('loads and shows replies when expanded', async () => {
      getComments.mockResolvedValue({ totalText: '', comments: [comment()] })
      getCommentReplies.mockResolvedValue([reply])
      render(<Comments videoId="v1" />)

      await userEvent.click(await screen.findByText(/Show 961 replies/))
      expect(await screen.findByText('A reply')).toBeInTheDocument()
      expect(getCommentReplies).toHaveBeenCalledWith('v1', 'c1')
    })

    it('collapses without refetching', async () => {
      getComments.mockResolvedValue({ totalText: '', comments: [comment()] })
      getCommentReplies.mockResolvedValue([reply])
      render(<Comments videoId="v1" />)

      await userEvent.click(await screen.findByText(/Show 961 replies/))
      await screen.findByText('A reply')
      await userEvent.click(screen.getByText(/Hide 961 replies/))
      expect(screen.queryByText('A reply')).not.toBeInTheDocument()

      await userEvent.click(screen.getByText(/Show 961 replies/))
      await screen.findByText('A reply')
      expect(getCommentReplies).toHaveBeenCalledTimes(1)
    })

    it('offers no toggle when a comment has none', async () => {
      getComments.mockResolvedValue({
        totalText: '', comments: [comment({ hasReplies: false, replyCount: '' })],
      })
      render(<Comments videoId="v1" />)
      await screen.findByText('Nice video')
      expect(screen.queryByText(/replies/)).not.toBeInTheDocument()
    })

    it('reports an empty thread when the fetch fails', async () => {
      getComments.mockResolvedValue({ totalText: '', comments: [comment()] })
      getCommentReplies.mockRejectedValue(new Error('nope'))
      render(<Comments videoId="v1" />)

      await userEvent.click(await screen.findByText(/Show 961 replies/))
      expect(await screen.findByText('No replies.')).toBeInTheDocument()
    })
  })
})
