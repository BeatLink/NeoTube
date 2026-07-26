import { useCallback, useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  getPlaylist, deletePlaylist, renamePlaylist,
  removeFromPlaylist, reorderPlaylist,
  getSubscribedPlaylist, unsubscribeFromPlaylist, refreshSubscribedPlaylist,
} from '../../db/playlists'
import { pluginManager } from '../../plugins/manager'
import { timeAgo } from '../../utils/format'
import type { PlaylistVideo, PersonalPlaylist, SubscribedPlaylist } from '../../types'
import PageLayout from '../../components/PageLayout'
import VideoThumbnail from '../../components/VideoThumbnail'
import Button from '../../components/Button'
import './Playlist.css'

type Loaded =
  | { kind: 'personal'; doc: PersonalPlaylist }
  | { kind: 'subscribed'; doc: SubscribedPlaylist }

/** `/playlist/yt/:id` is a subscribed YouTube list; `/playlist/:id` is a personal one. */
export default function Playlist({ subscribed = false }: { subscribed?: boolean }) {
  const { playlistId } = useParams<{ playlistId: string }>()
  const [state, setState] = useState<Loaded | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [renaming, setRenaming] = useState(false)
  const [draftTitle, setDraftTitle] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const load = useCallback(() => {
    if (!playlistId) return
    const fetch = subscribed
      ? getSubscribedPlaylist(playlistId).then(doc => doc && { kind: 'subscribed' as const, doc })
      : getPlaylist(playlistId).then(doc => doc && { kind: 'personal' as const, doc })

    fetch
      .then(result => setState(result ?? null))
      .catch(() => setState(null))
      .finally(() => setLoading(false))
  }, [playlistId, subscribed])

  useEffect(() => {
    load()
    window.addEventListener('playlists-changed', load)
    return () => window.removeEventListener('playlists-changed', load)
  }, [load])

  async function handleRefresh() {
    if (!playlistId || state?.kind !== 'subscribed') return
    const plugin = pluginManager.getActive()
    if (!plugin.getPlaylist) return

    setRefreshing(true)
    try {
      const fresh = await plugin.getPlaylist(playlistId)
      await refreshSubscribedPlaylist(playlistId, fresh.videos.map(toPlaylistVideo))
    } catch {
      // Keep the existing snapshot rather than clearing it.
    } finally {
      setRefreshing(false)
    }
  }

  if (loading) return <p className="playlist-status">Loading…</p>
  if (!state) return <p className="playlist-status">Playlist not found.</p>

  const { doc } = state
  const isPersonal = state.kind === 'personal'
  const videos = doc.videos

  return (
    <PageLayout
      title={doc.title}
      subtitle={
        isPersonal
          ? `${videos.length} ${videos.length === 1 ? 'video' : 'videos'}`
          : `${(doc as SubscribedPlaylist).author} · ${videos.length} videos`
      }
      actions={
        <>
          {!isPersonal && (
            <Button onClick={handleRefresh} disabled={refreshing}>
              {refreshing ? 'Refreshing…' : 'Refresh'}
            </Button>
          )}
          {isPersonal && !renaming && (
            <Button onClick={() => { setRenaming(true); setDraftTitle(doc.title) }}>
              Rename
            </Button>
          )}
          {confirmDelete ? (
            <>
              <Button
                size="sm"
                variant="danger"
                onClick={async () => {
                  if (!playlistId) return
                  if (isPersonal) await deletePlaylist(playlistId)
                  else await unsubscribeFromPlaylist(playlistId)
                  window.history.back()
                }}
              >
                {isPersonal ? 'Yes, delete' : 'Yes, unsubscribe'}
              </Button>
              <Button size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            </>
          ) : (
            <Button variant="danger" onClick={() => setConfirmDelete(true)}>
              {isPersonal ? 'Delete' : 'Unsubscribe'}
            </Button>
          )}
        </>
      }
      extra={
        <>
          {renaming && (
            <form
              className="playlist-rename"
              onSubmit={async e => {
                e.preventDefault()
                if (!playlistId || !draftTitle.trim()) return
                await renamePlaylist(playlistId, draftTitle.trim())
                setRenaming(false)
              }}
            >
              <input
                className="playlist-rename-input"
                value={draftTitle}
                onChange={e => setDraftTitle(e.target.value)}
                aria-label="Playlist name"
                autoFocus
              />
              <Button variant="primary" type="submit">Save</Button>
              <Button type="button" onClick={() => setRenaming(false)}>Cancel</Button>
            </form>
          )}
          {!isPersonal && (
            <p className="playlist-snapshot-note">
              Snapshot taken {timeAgo((doc as SubscribedPlaylist).fetchedAt)}.
            </p>
          )}
          {doc.description && <p className="playlist-description">{doc.description}</p>}
        </>
      }
    >
      {videos.length === 0 ? (
        <p className="playlist-empty">
          {isPersonal
            ? 'No videos yet. Add some from a video\'s menu.'
            : 'This playlist is empty.'}
        </p>
      ) : (
        <ol className="playlist-videos">
          {videos.map((video, index) => (
            <PlaylistRow
              key={video.videoId}
              video={video}
              index={index}
              total={videos.length}
              editable={isPersonal}
              onRemove={() => playlistId && removeFromPlaylist(playlistId, video.videoId)}
              onMove={to => playlistId && reorderPlaylist(playlistId, video.videoId, to)}
            />
          ))}
        </ol>
      )}
    </PageLayout>
  )
}

function toPlaylistVideo(v: {
  videoId: string; title: string; channelId: string; channelName: string
  thumbnail: string; duration: number; viewCountText?: string; publishedText?: string
}): PlaylistVideo {
  return {
    videoId: v.videoId,
    title: v.title,
    channelId: v.channelId,
    channelName: v.channelName,
    thumbnail: v.thumbnail,
    duration: v.duration,
    viewCountText: v.viewCountText,
    publishedText: v.publishedText,
  }
}

function PlaylistRow({ video, index, total, editable, onRemove, onMove }: {
  video: PlaylistVideo
  index: number
  total: number
  editable: boolean
  onRemove: () => void
  onMove: (toIndex: number) => void
}) {
  const stats = [video.viewCountText, video.publishedText].filter(Boolean)

  return (
    <li className="playlist-row">
      <span className="playlist-row-index">{index + 1}</span>
      <Link to={`/watch/${video.videoId}`} className="playlist-row-thumb">
        <VideoThumbnail src={video.thumbnail} duration={video.duration} />
      </Link>
      <div className="playlist-row-info">
        <Link to={`/watch/${video.videoId}`} className="playlist-row-title">{video.title}</Link>
        {video.channelName && (
          <p className="playlist-row-channel">{video.channelName}</p>
        )}
        {stats.length > 0 && <p className="playlist-row-meta">{stats.join(' · ')}</p>}
      </div>

      {editable && (
        <div className="playlist-row-actions">
          <button
            className="playlist-row-btn"
            onClick={() => onMove(index - 1)}
            disabled={index === 0}
            aria-label={`Move ${video.title} up`}
            title="Move up"
          >
            ↑
          </button>
          <button
            className="playlist-row-btn"
            onClick={() => onMove(index + 1)}
            disabled={index === total - 1}
            aria-label={`Move ${video.title} down`}
            title="Move down"
          >
            ↓
          </button>
          <button
            className="playlist-row-btn playlist-row-remove"
            onClick={onRemove}
            aria-label={`Remove ${video.title} from playlist`}
            title="Remove"
          >
            ✕
          </button>
        </div>
      )}
    </li>
  )
}
