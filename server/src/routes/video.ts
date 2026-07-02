import type { FastifyInstance } from 'fastify'
import * as innertube from '../innertube.js'
import * as ytdlp from '../ytdlp.js'

export default async function videoRoutes(app: FastifyInstance) {
  // GET /api/search?q=&limit=&backend=
  app.get('/api/search', async (req, reply) => {
    const { q, limit = '10', backend = 'youtubejs' } = req.query as Record<string, string>
    if (!q) return reply.code(400).send({ error: 'Missing query parameter q' })
    const n = Math.min(parseInt(limit, 10) || 10, 50)
    try {
      const results = backend === 'ytdlp'
        ? await ytdlp.search(q, n)
        : await innertube.search(q, n)
      return results
    } catch (err) {
      req.log.error(err)
      return reply.code(502).send({ error: 'Search failed', detail: String(err) })
    }
  })

  // GET /api/video/:id?backend=
  app.get('/api/video/:id', async (req, reply) => {
    const { id } = req.params as { id: string }
    const { backend = 'youtubejs' } = req.query as Record<string, string>
    try {
      const info = backend === 'ytdlp'
        ? await ytdlp.getInfo(id)
        : await innertube.getInfo(id)
      return info
    } catch (err) {
      req.log.error(err)
      return reply.code(502).send({ error: 'Failed to fetch video info', detail: String(err) })
    }
  })
}
