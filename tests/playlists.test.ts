import { describe, it, expect, vi, beforeEach } from 'vitest'
import PouchDB from 'pouchdb'
// @ts-expect-error — no type declaration for pouchdb-adapter-memory
import MemoryAdapter from 'pouchdb-adapter-memory'

PouchDB.plugin(MemoryAdapter)

const db = new PouchDB('playlists-test', { adapter: 'memory' })
vi.mock('../src/db/client', () => ({ db: () => db }))

const {
  createPlaylist, getPlaylist, getPlaylists, renamePlaylist, deletePlaylist,
  addToPlaylist, removeFromPlaylist, reorderPlaylist,
  subscribeToPlaylist, unsubscribeFromPlaylist, getSubscribedPlaylists,
  isPlaylistSubscribed, refreshSubscribedPlaylist, getAllPlaylists,
} = await import('../src/db/playlists')

function video(id: string) {
  return {
    videoId: id,
    title: `Video ${id}`,
    channelId: 'c1',
    channelName: 'Chan',
    thumbnail: `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    duration: 100,
  }
}

async function reset() {
  const all = await db.allDocs()
  await Promise.all(all.rows.map(r => db.remove(r.id, r.value.rev)))
}

async function ids(playlistId: string): Promise<string[]> {
  return (await getPlaylist(playlistId))!.videos.map(v => v.videoId)
}

describe('personal playlists', () => {
  beforeEach(reset)

  it('creates an empty playlist', async () => {
    const p = await createPlaylist('Favourites')
    expect(p.title).toBe('Favourites')
    expect(p.videos).toEqual([])
    expect(await getPlaylist(p.playlistId)).not.toBeNull()
  })

  it('gives each playlist a distinct id', async () => {
    const a = await createPlaylist('A')
    const b = await createPlaylist('B')
    expect(a.playlistId).not.toBe(b.playlistId)
  })

  // The document id and playlistId must agree, or lookups miss.
  it('derives the document id from the playlist id', async () => {
    const p = await createPlaylist('A')
    expect(p._id).toBe(`playlist-${p.playlistId}`)
  })

  it('lists playlists alphabetically', async () => {
    await createPlaylist('Zebra')
    await createPlaylist('Apple')
    expect((await getPlaylists()).map(p => p.title)).toEqual(['Apple', 'Zebra'])
  })

  it('renames a playlist', async () => {
    const p = await createPlaylist('Old')
    await renamePlaylist(p.playlistId, 'New')
    expect((await getPlaylist(p.playlistId))?.title).toBe('New')
  })

  it('deletes a playlist', async () => {
    const p = await createPlaylist('Temp')
    await deletePlaylist(p.playlistId)
    expect(await getPlaylist(p.playlistId)).toBeNull()
  })

  it('adds videos in order', async () => {
    const p = await createPlaylist('A')
    await addToPlaylist(p.playlistId, video('v1'))
    await addToPlaylist(p.playlistId, video('v2'))
    expect(await ids(p.playlistId)).toEqual(['v1', 'v2'])
  })

  it('ignores a video already in the playlist', async () => {
    const p = await createPlaylist('A')
    await addToPlaylist(p.playlistId, video('v1'))
    await addToPlaylist(p.playlistId, video('v1'))
    expect(await ids(p.playlistId)).toEqual(['v1'])
  })

  it('removes a video', async () => {
    const p = await createPlaylist('A')
    await addToPlaylist(p.playlistId, video('v1'))
    await addToPlaylist(p.playlistId, video('v2'))
    await removeFromPlaylist(p.playlistId, 'v1')
    expect(await ids(p.playlistId)).toEqual(['v2'])
  })

  it('updates updatedAt when the contents change', async () => {
    const p = await createPlaylist('A')
    const before = (await getPlaylist(p.playlistId))!.updatedAt
    await new Promise(r => setTimeout(r, 5))
    await addToPlaylist(p.playlistId, video('v1'))
    expect((await getPlaylist(p.playlistId))!.updatedAt).not.toBe(before)
  })
})

describe('reorderPlaylist', () => {
  beforeEach(reset)

  async function seeded() {
    const p = await createPlaylist('A')
    for (const id of ['v1', 'v2', 'v3', 'v4']) {
      await addToPlaylist(p.playlistId, video(id))
    }
    return p.playlistId
  }

  it('moves a video later', async () => {
    const id = await seeded()
    await reorderPlaylist(id, 'v1', 2)
    expect(await ids(id)).toEqual(['v2', 'v3', 'v1', 'v4'])
  })

  it('moves a video earlier', async () => {
    const id = await seeded()
    await reorderPlaylist(id, 'v4', 0)
    expect(await ids(id)).toEqual(['v4', 'v1', 'v2', 'v3'])
  })

  it('is a no-op when the position is unchanged', async () => {
    const id = await seeded()
    await reorderPlaylist(id, 'v2', 1)
    expect(await ids(id)).toEqual(['v1', 'v2', 'v3', 'v4'])
  })

  // A drag past either end should land at the end, not throw or corrupt order.
  it('clamps an index beyond the end', async () => {
    const id = await seeded()
    await reorderPlaylist(id, 'v1', 99)
    expect(await ids(id)).toEqual(['v2', 'v3', 'v4', 'v1'])
  })

  it('clamps a negative index', async () => {
    const id = await seeded()
    await reorderPlaylist(id, 'v3', -5)
    expect(await ids(id)).toEqual(['v3', 'v1', 'v2', 'v4'])
  })

  it('ignores a video that is not in the playlist', async () => {
    const id = await seeded()
    await reorderPlaylist(id, 'missing', 0)
    expect(await ids(id)).toEqual(['v1', 'v2', 'v3', 'v4'])
  })
})

describe('subscribed playlists', () => {
  beforeEach(reset)

  const remote = {
    playlistId: 'PL123',
    title: 'Space',
    author: 'Kurzgesagt',
    thumbnail: 'https://x/t.jpg',
    videos: [video('a'), video('b')],
  }

  it('stores the snapshot with its videos', async () => {
    await subscribeToPlaylist(remote)
    const [saved] = await getSubscribedPlaylists()
    expect(saved.title).toBe('Space')
    expect(saved.videos).toHaveLength(2)
  })

  it('reports subscription state', async () => {
    expect(await isPlaylistSubscribed('PL123')).toBe(false)
    await subscribeToPlaylist(remote)
    expect(await isPlaylistSubscribed('PL123')).toBe(true)
  })

  it('unsubscribes', async () => {
    await subscribeToPlaylist(remote)
    await unsubscribeFromPlaylist('PL123')
    expect(await isPlaylistSubscribed('PL123')).toBe(false)
  })

  it('replaces the videos on refresh and moves fetchedAt', async () => {
    await subscribeToPlaylist(remote)
    const before = (await getSubscribedPlaylists())[0].fetchedAt
    await new Promise(r => setTimeout(r, 5))

    await refreshSubscribedPlaylist('PL123', [video('c')])
    const [after] = await getSubscribedPlaylists()
    expect(after.videos.map(v => v.videoId)).toEqual(['c'])
    expect(after.fetchedAt).not.toBe(before)
  })

  // Re-subscribing refreshes contents but shouldn't reset when it was added.
  it('keeps the original subscribedAt when re-subscribing', async () => {
    await subscribeToPlaylist(remote)
    const first = (await getSubscribedPlaylists())[0].subscribedAt
    await new Promise(r => setTimeout(r, 5))
    await subscribeToPlaylist({ ...remote, videos: [video('z')] })

    const [again] = await getSubscribedPlaylists()
    expect(again.subscribedAt).toBe(first)
    expect(again.videos.map(v => v.videoId)).toEqual(['z'])
  })
})

describe('playlist separation', () => {
  beforeEach(reset)

  // `playlist-` is a prefix of `playlistsub-`, so a careless key range would
  // return subscribed playlists from the personal query.
  it('keeps personal and subscribed playlists apart', async () => {
    await createPlaylist('Mine')
    await subscribeToPlaylist({
      playlistId: 'PL1', title: 'Theirs', author: 'A', thumbnail: '', videos: [],
    })

    expect((await getPlaylists()).map(p => p.title)).toEqual(['Mine'])
    expect((await getSubscribedPlaylists()).map(p => p.title)).toEqual(['Theirs'])
    expect(await getAllPlaylists()).toHaveLength(2)
  })
})
