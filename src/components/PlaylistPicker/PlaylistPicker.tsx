import { useEffect, useRef, useState } from 'react'
import { getPlaylists, addToPlaylist, createPlaylist } from '../../db/playlists'
import type { PersonalPlaylist, PlaylistVideo } from '../../types'
import Button from '../Button'
import './PlaylistPicker.css'

interface PlaylistPickerProps {
  video: PlaylistVideo
  onClose: () => void
}

/** Modal for adding a video to one or more personal playlists. */
export default function PlaylistPicker({ video, onClose }: PlaylistPickerProps) {
  const [playlists, setPlaylists] = useState<PersonalPlaylist[] | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const dialogRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    getPlaylists()
      .then(lists => {
        setPlaylists(lists)
        // Pre-mark lists that already contain this video.
        setAdded(new Set(
          lists.filter(l => l.videos.some(v => v.videoId === video.videoId))
            .map(l => l.playlistId),
        ))
      })
      .catch(() => setPlaylists([]))
  }, [video.videoId])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  async function handleAdd(playlistId: string) {
    await addToPlaylist(playlistId, video)
    setAdded(prev => new Set(prev).add(playlistId))
  }

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    const playlist = await createPlaylist(title)
    await addToPlaylist(playlist.playlistId, video)
    setPlaylists(prev => [...(prev ?? []), playlist])
    setAdded(prev => new Set(prev).add(playlist.playlistId))
    setNewTitle('')
    setCreating(false)
  }

  return (
    <div
      className="playlist-picker-backdrop"
      onClick={e => { if (!dialogRef.current?.contains(e.target as Node)) onClose() }}
    >
      <div
        className="playlist-picker"
        ref={dialogRef}
        role="dialog"
        aria-label="Add to playlist"
        // The card is wrapped in links; keep clicks from navigating.
        onClick={e => e.stopPropagation()}
      >
        <h3 className="playlist-picker-title">Add to playlist</h3>

        {playlists === null ? (
          <p className="playlist-picker-status">Loading…</p>
        ) : playlists.length === 0 && !creating ? (
          <p className="playlist-picker-status">No playlists yet.</p>
        ) : (
          <ul className="playlist-picker-list">
            {playlists.map(p => (
              <li key={p.playlistId}>
                <button
                  className="playlist-picker-item"
                  onClick={() => handleAdd(p.playlistId)}
                  disabled={added.has(p.playlistId)}
                >
                  <span className="playlist-picker-check">
                    {added.has(p.playlistId) ? '✓' : ''}
                  </span>
                  <span className="playlist-picker-name">{p.title}</span>
                  <span className="playlist-picker-count">{p.videos.length}</span>
                </button>
              </li>
            ))}
          </ul>
        )}

        {creating ? (
          <form className="playlist-picker-create" onSubmit={handleCreate}>
            <input
              className="playlist-picker-input"
              value={newTitle}
              onChange={e => setNewTitle(e.target.value)}
              placeholder="Playlist name"
              aria-label="New playlist name"
              autoFocus
            />
            <Button variant="primary" size="sm" type="submit" disabled={!newTitle.trim()}>
              Create
            </Button>
          </form>
        ) : (
          <button className="playlist-picker-new" onClick={() => setCreating(true)}>
            + New playlist
          </button>
        )}
      </div>
    </div>
  )
}
