import type { FastifyInstance } from 'fastify'
import * as innertube from '../innertube.js'
import * as ytdlp from '../ytdlp.js'
import * as db from '../db.js'

export default async function channelRoutes(app: FastifyInstance) {
  // GET /api/channel/:id?backend=
  app.get('/api/channel/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { backend = 'youtubejs' } = req.query as Record<string, string>
    try {
      return backend === 'ytdlp'
        ? await ytdlp.getChannelInfo(id)
        : await innertube.getChannelInfo(id)
    } catch (err) {
      req.log.error(err)
      return reply.code(502).send({ error: 'Failed to fetch channel info', detail: String(err) })
    }
  })

  // GET /api/channel/:id/videos?limit=&backend=
  app.get('/api/channel/:id/videos', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { limit = '30', backend = 'youtubejs' } = req.query as Record<string, string>
    const n = Math.min(parseInt(limit, 10) || 30, 100)
    try {
      const videos = backend === 'ytdlp'
        ? await ytdlp.getChannelVideos(id, n)
        : await innertube.getChannelVideos(id, n)
      // Persist to cache
      db.setCachedChannelVideos(id, videos).catch(() => {})
      return videos
    } catch (err) {
      // Fall back to cache on network failure
      const cached = await db.getCachedChannelVideos(id)
      if (cached) return cached
      req.log.error(err)
      return reply.code(502).send({ error: 'Failed to fetch channel videos', detail: String(err) })
    }
  })

  // GET /api/channel/:id/playlists?limit=&backend=
  app.get('/api/channel/:id/playlists', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { limit = '20', backend = 'youtubejs' } = req.query as Record<string, string>
    const n = Math.min(parseInt(limit, 10) || 20, 50)
    try {
      return backend === 'ytdlp'
        ? await ytdlp.getChannelPlaylists(id, n)
        : await innertube.getChannelPlaylists(id, n)
    } catch (err) {
      req.log.error(err)
      return reply.code(502).send({ error: 'Failed to fetch channel playlists', detail: String(err) })
    }
  })

  // GET /api/channel-cache/:id
  app.get('/api/channel-cache/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const cached = await db.getCachedChannelVideos(id)
    if (!cached) return reply.code(404).send({ error: 'No cache for this channel' })
    return cached
  })

  // PUT /api/channel-cache/:id
  app.put('/api/channel-cache/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    await db.setCachedChannelVideos(id, req.body as Parameters<typeof db.setCachedChannelVideos>[1])
    return reply.code(204).send()
  })
}
