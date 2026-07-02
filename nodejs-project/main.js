'use strict'

// capacitor-nodejs bridge — thin IPC wrapper around the shared ytjs-handlers.
// Handler logic is bundled into handlers.js from electron/ytjs-handlers.ts.
// channel.send(event, payload) → renderer receives payload as event.args[0].

const { channel } = require('bridge')
const h = require('./handlers')

channel.addListener('ytjs:invoke', async (payload) => {
  const { id, method, args } = payload
  try {
    const fn = h[method]
    if (!fn) throw new Error(`Unknown method: ${method}`)
    const result = await fn(...(args ?? []))
    channel.send('ytjs:result', { id, result })
  } catch (e) {
    channel.send('ytjs:result', { id, error: e.message ?? String(e) })
  }
})
