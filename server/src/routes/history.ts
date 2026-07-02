import type { FastifyInstance } from 'fastify'
import * as db from '../db.js'

export default async function historyRoutes(app: FastifyInstance) {
  // GET /api/history
  app.get('/api/history', async () => db.getHistory())

  // GET /api/history/watched-ids
  app.get('/api/history/watched-ids', async () => db.getWatchedVideoIds())

  // POST /api/history  { videoId, title, channelId, channelName, thumbnail, duration }
  app.post('/api/history', async (req, reply) => {
    const { videoId, title, channelId, channelName, thumbnail, duration } = req.body as {
      videoId: string; title: string; channelId: string
      channelName: string; thumbnail: string; duration: number
    }
    if (!videoId) return reply.code(400).send({ error: 'videoId is required' })
    await db.recordWatch(videoId, title, channelId, channelName, thumbnail, duration)
    return reply.code(201).send({ ok: true })
  })

  // DELETE /api/history  (clear all)
  app.delete('/api/history', async (req, reply) => {
    await db.clearHistory()
    return reply.code(204).send()
  })

  // DELETE /api/history/:videoId
  app.delete('/api/history/:videoId', async (req, reply) => {
    const { videoId } = req.params as { videoId: string }
    await db.removeFromHistory(videoId)
    return reply.code(204).send()
  })
}
