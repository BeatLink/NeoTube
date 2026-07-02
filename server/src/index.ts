import Fastify from 'fastify'
import cors from '@fastify/cors'
import { getSettings } from './db.js'
import { setCookie } from './innertube.js'
import videoRoutes from './routes/video.js'
import channelRoutes from './routes/channel.js'
import subscriptionRoutes from './routes/subscriptions.js'
import historyRoutes from './routes/history.js'
import settingsRoutes from './routes/settings.js'
import proxyRoutes from './routes/proxy.js'
import syncRoutes from './routes/sync.js'

const PORT = parseInt(process.env.NEOTUBE_PORT ?? '7700', 10)
const HOST = process.env.NEOTUBE_HOST ?? '0.0.0.0'
const API_KEY = process.env.NEOTUBE_API_KEY ?? ''

const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' } })

// ─── CORS ─────────────────────────────────────────────────────────────────────
// Allow any origin — the server is meant to run on a private network.
await app.register(cors, { origin: true })

// ─── Optional API key auth ────────────────────────────────────────────────────
if (API_KEY) {
  app.addHook('onRequest', async (req, reply) => {
    if (req.headers['x-api-key'] !== API_KEY) {
      return reply.code(401).send({ error: 'Unauthorized' })
    }
  })
}

// ─── Routes ───────────────────────────────────────────────────────────────────
await app.register(videoRoutes)
await app.register(channelRoutes)
await app.register(subscriptionRoutes)
await app.register(historyRoutes)
await app.register(settingsRoutes)
await app.register(proxyRoutes)
await app.register(syncRoutes)

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/api/health', async () => ({ ok: true, version: '0.1.0' }))

// ─── Startup ──────────────────────────────────────────────────────────────────
// Restore YouTube cookie from persisted settings so Innertube is authenticated
// from the first request without needing a client to re-send it.
const settings = await getSettings().catch(() => null)
if (settings?.ytCookie) await setCookie(settings.ytCookie)

await app.listen({ port: PORT, host: HOST })
console.log(`NeoTube server running on http://localhost:${PORT}`)
