import type { FastifyInstance } from 'fastify'
import * as db from '../db.js'

export default async function subscriptionRoutes(app: FastifyInstance) {
  // GET /api/subscriptions
  app.get('/api/subscriptions', async () => db.getSubscriptions())

  // GET /api/subscriptions/:channelId/status
  app.get('/api/subscriptions/:channelId/status', async (req) => {
    const { channelId } = req.params as { channelId: string }
    return { subscribed: await db.isSubscribed(channelId) }
  })

  // POST /api/subscriptions  { channelId, channelName, avatar? }
  app.post('/api/subscriptions', async (req, reply) => {
    const { channelId, channelName, avatar } = req.body as {
      channelId: string; channelName: string; avatar?: string
    }
    if (!channelId || !channelName) {
      return reply.code(400).send({ error: 'channelId and channelName are required' })
    }
    await db.subscribe(channelId, channelName, avatar)
    return reply.code(201).send({ ok: true })
  })

  // DELETE /api/subscriptions/:channelId
  app.delete('/api/subscriptions/:channelId', async (req, reply) => {
    const { channelId } = req.params as { channelId: string }
    await db.unsubscribe(channelId)
    return reply.code(204).send()
  })
}
