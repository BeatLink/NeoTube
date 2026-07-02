import type { FastifyInstance } from 'fastify'

export default async function proxyRoutes(app: FastifyInstance) {
  // GET /api/proxy?url=<encoded-url>
  // Fetches a remote image without CORS restrictions and streams the bytes.
  // Clients can use this URL directly as an <img> src or download the bytes
  // to store as a base64 data URI.
  app.get('/api/proxy', async (req, reply) => {
    const { url } = req.query as { url?: string }
    if (!url) return reply.code(400).send({ error: 'Missing url parameter' })

    let target: URL
    try {
      target = new URL(url)
    } catch {
      return reply.code(400).send({ error: 'Invalid url' })
    }

    // Only allow proxying image hosts used by YouTube
    const allowed = [
      'i.ytimg.com', 'img.youtube.com',
      'yt3.ggpht.com', 'yt3.googleusercontent.com',
      'lh3.googleusercontent.com',
    ]
    if (!allowed.some(h => target.hostname === h || target.hostname.endsWith(`.${h}`))) {
      return reply.code(403).send({ error: 'Host not allowed' })
    }

    try {
      const upstream = await fetch(url)
      if (!upstream.ok) {
        return reply.code(upstream.status).send({ error: `Upstream returned ${upstream.status}` })
      }
      const contentType = upstream.headers.get('content-type') ?? 'image/jpeg'
      reply.header('Content-Type', contentType)
      reply.header('Cache-Control', 'public, max-age=86400')
      return reply.send(upstream.body)
    } catch (err) {
      req.log.error(err)
      return reply.code(502).send({ error: 'Proxy fetch failed', detail: String(err) })
    }
  })
}
