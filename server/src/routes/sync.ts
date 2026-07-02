import type { FastifyInstance } from 'fastify'
import * as db from '../db.js'

export default async function syncRoutes(app: FastifyInstance) {
  // POST /api/sync  { remoteUrl }
  // Triggers a one-shot PouchDB sync to a remote CouchDB-compatible server.
  app.post('/api/sync', async (req, reply) => {
    const { remoteUrl } = req.body as { remoteUrl?: string }
    if (!remoteUrl) return reply.code(400).send({ error: 'remoteUrl is required' })

    return new Promise((resolve) => {
      const sync = db.syncWith(remoteUrl)
      // syncWith returns a live sync — we wait for one complete cycle then detach
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const handler = (info: any) => {
        sync.cancel()
        resolve({ ok: true, pushed: info?.push?.docs_written ?? 0, pulled: info?.pull?.docs_written ?? 0 })
      }
      sync.on('complete', handler)
      sync.on('error', (err: Error) => {
        sync.cancel()
        resolve(reply.code(502).send({ error: 'Sync failed', detail: err.message }))
      })
    })
  })
}
