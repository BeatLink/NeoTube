import { useEffect, useState } from 'react'
import { pluginManager } from '../../plugins/manager'
import type { CommentThread } from '../../plugins/types'
import './Comments.css'

interface CommentsProps {
  videoId: string
}

export default function Comments({ videoId }: CommentsProps) {
  const [thread, setThread] = useState<CommentThread | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const plugin = pluginManager.getActive()
    if (!plugin.getComments) { setLoading(false); return }

    let cancelled = false
    setLoading(true)
    setThread(null)
    plugin
      .getComments(videoId)
      .then(t => { if (!cancelled) { setThread(t); setLoading(false) } })
      // Comments are optional — a failure shouldn't disturb the page.
      .catch(() => { if (!cancelled) { setThread(null); setLoading(false) } })
    return () => { cancelled = true }
  }, [videoId])

  if (loading) return <p className="comments-status">Loading comments…</p>
  if (!thread || thread.comments.length === 0) {
    return <p className="comments-status">No comments.</p>
  }

  return (
    <section className="comments">
      <h2 className="comments-title">{thread.totalText || 'Comments'}</h2>
      <ul className="comments-list">
        {thread.comments.map(c => (
          <li key={c.commentId} className="comment">
            {c.authorAvatar
              ? <img className="comment-avatar" src={c.authorAvatar} alt="" loading="lazy" />
              : <div className="comment-avatar comment-avatar-blank" aria-hidden="true" />
            }
            <div className="comment-body">
              <p className="comment-head">
                {c.isPinned && <span className="comment-pin" title="Pinned">📌</span>}
                <span className={`comment-author${c.authorIsOwner ? ' comment-author-owner' : ''}`}>
                  {c.author}
                </span>
                <span className="comment-date">{c.publishedText}</span>
              </p>
              <p className="comment-text">{c.text}</p>
              <p className="comment-meta">
                {c.likeCount && <span>👍 {c.likeCount}</span>}
                {c.replyCount && <span>{c.replyCount} replies</span>}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </section>
  )
}
