import { describe, it, expect } from 'vitest'

/**
 * These pin two things that silently broke playback once already:
 *
 *  - `/player` must name a client. Without one it defaults to WEB, which
 *    YouTube answers UNPLAYABLE unless the request carries a PoToken.
 *  - The client id lookup must survive youtubei.js keying iOS as "iOS", not
 *    "IOS". Getting it wrong sends NaN as the client id rather than failing
 *    loudly.
 */
describe('SABR client identification', () => {
  it('keys the iOS client id as "iOS", not "IOS"', async () => {
    const { Constants } = await import('youtubei.js')
    const ids = Constants.CLIENT_NAME_IDS as unknown as Record<string, string>

    expect(ids.iOS).toBe('5')
    // The obvious spelling is absent — hence the fallback in getSabrClientInfo.
    expect(ids.IOS).toBeUndefined()
  })

  it('resolves a numeric client id through the fallback chain', async () => {
    const { Constants } = await import('youtubei.js')
    const ids = Constants.CLIENT_NAME_IDS as unknown as Record<string, string>

    // Mirrors getSabrClientInfo: STREAM_CLIENT ?? iOS ?? WEB.
    const resolved = parseInt(ids['IOS'] ?? ids.iOS ?? ids.WEB)
    expect(Number.isNaN(resolved)).toBe(false)
    expect(resolved).toBe(5)
  })

  it('requests the iOS client, which YouTube accepts without a PoToken', async () => {
    const source = await import('../src/plugins/youtubejs/innertube?raw')
      .then(m => m.default as string)
      .catch(async () => {
        const fs = await import('node:fs/promises')
        return fs.readFile('src/plugins/youtubejs/innertube.ts', 'utf-8')
      })

    expect(source).toContain("const STREAM_CLIENT = 'IOS'")
    // The /player call must pass the client explicitly.
    expect(source).toContain('client: STREAM_CLIENT')
  })
})
