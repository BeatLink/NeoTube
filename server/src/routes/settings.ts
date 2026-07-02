import type { FastifyInstance } from 'fastify'
import * as db from '../db.js'
import * as innertube from '../innertube.js'

export default async function settingsRoutes(app: FastifyInstance) {
  // GET /api/settings
  app.get('/api/settings', async () => db.getSettings())

  // PATCH /api/settings
  app.patch('/api/settings', async (req, reply) => {
    const patch = req.body as Parameters<typeof db.saveSettings>[0]
    // If the cookie changed, reset the Innertube client so it picks it up
    if ('ytCookie' in patch) {
      await innertube.setCookie(patch.ytCookie ?? '')
    }
    await db.saveSettings(patch)
    return reply.code(204).send()
  })
}
