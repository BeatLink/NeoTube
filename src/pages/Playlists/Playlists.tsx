import { useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { getAllPlaylists, createPlaylist } from '../../db/playlists'
import { isPersonalPlaylist, type AnyPlaylist } from '../../types'
import PageLayout from '../../components/PageLayout'
import Button from '../../components/Button'
import './Playlists.css'

export default function Playlists() {
  const [playlists, setPlaylists] = useState<AnyPlaylist[]>([])
  const [loading, setLoading] = useState(true)
  const [creating, setCreating] = useState(false)
  const [newTitle, setNewTitle] = useState('')

  const load = useCallback(() => {
    getAllPlaylists()
      .then(setPlaylists)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    load()
    window.addEventListener('playlists-changed', load)
    return () => window.removeEventListener('playlists-changed', load)
  }, [load])

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault()
    const title = newTitle.trim()
    if (!title) return
    await createPlaylist(title)
    setNewTitle('')
    setCreating(false)
  }

  if (loading) return <p className="playlists-status">Loading…</p>

  const personal = playlists.filter(isPersonalPlaylist)
  const subscribed = playlists.filter(p => !isPersonalPlaylist(p))

  return (
    <PageLayout
      title="Playlists"
      actions={
        creating ? undefined : (
          <Button variant="primary" onClick={() => setCreating(true)}>New playlist</Button>
        )
      }
    >
      {creating && (
        <form className="playlist-create" onSubmit={handleCreate}>
          <input
            className="playlist-create-input"
            value={newTitle}
            onChange={e => setNewTitle(e.target.value)}
            placeholder="Playlist name"
            aria-label="Playlist name"
            autoFocus
          />
          <Button variant="primary" type="submit" disabled={!newTitle.trim()}>Create</Button>
          <Button type="button" onClick={() => { setCreating(false); setNewTitle('') }}>
            Cancel
          </Button>
        </form>
      )}

      {playlists.length === 0 && !creating ? (
        <p className="playlists-empty">
          No playlists yet. Create one above, or subscribe to a playlist from a channel page.
        </p>
      ) : (
        <>
          {personal.length > 0 && (
            <section className="playlist-section">
              <h3 className="playlist-section-title">Your playlists</h3>
              <ul className="playlist-grid">
                {personal.map(p => (
                  <PlaylistTile
                    key={p._id}
                    to={`/playlist/${p.playlistId}`}
                    title={p.title}
                    thumbnail={p.videos[0]?.thumbnail}
                    meta={`${p.videos.length} ${p.videos.length === 1 ? 'video' : 'videos'}`}
                  />
                ))}
              </ul>
            </section>
          )}

          {subscribed.length > 0 && (
            <section className="playlist-section">
              <h3 className="playlist-section-title">Subscribed</h3>
              <ul className="playlist-grid">
                {subscribed.map(p => (
                  <PlaylistTile
                    key={p._id}
                    to={`/playlist/yt/${p.playlistId}`}
                    title={p.title}
                    thumbnail={p.thumbnail || p.videos[0]?.thumbnail}
                    meta={`${p.videos.length} videos · ${'author' in p ? p.author : ''}`}
                  />
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </PageLayout>
  )
}

function PlaylistTile({ to, title, thumbnail, meta }: {
  to: string
  title: string
  thumbnail?: string
  meta: string
}) {
  return (
    <li className="playlist-tile">
      <Link to={to} className="playlist-tile-link">
        {thumbnail
          ? <img className="playlist-tile-thumb" src={thumbnail} alt="" loading="lazy" />
          : <div className="playlist-tile-thumb playlist-tile-thumb-empty" aria-hidden="true" />
        }
        <p className="playlist-tile-title">{title}</p>
        <p className="playlist-tile-meta">{meta}</p>
      </Link>
    </li>
  )
}
