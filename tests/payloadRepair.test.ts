import { describe, it, expect, vi } from 'vitest'

vi.mock('@tauri-apps/plugin-http', () => ({ fetch: vi.fn() }))
vi.mock('@tauri-apps/api/core', () => ({ invoke: vi.fn() }))

const { repairYouTubePayload } = await import('../src/utils/tauri')

/**
 * These guard two live YouTube schema changes that crash youtubei.js 17.2.0.
 * Without the repair, comments throw for the whole response and replies are
 * unreachable — see the doc comment on repairYouTubePayload.
 */
describe('repairYouTubePayload', () => {
  it('fills in a missing comment avatar', () => {
    const payload = {
      frameworkUpdates: {
        entityBatchUpdate: {
          mutations: [{ payload: { commentEntityPayload: { author: { displayName: 'x' } } } }],
        },
      },
    }
    repairYouTubePayload(payload)

    const comment = payload.frameworkUpdates.entityBatchUpdate.mutations[0]
      .payload.commentEntityPayload as Record<string, any>
    // The parser dereferences `avatar.endpoint` without checking.
    expect(comment.avatar).toBeDefined()
    expect(comment.avatar.image.sources).toEqual([])
  })

  it('leaves an existing avatar untouched', () => {
    const avatar = { endpoint: { real: true }, image: { sources: [{ url: 'u' }] } }
    const payload = {
      frameworkUpdates: {
        entityBatchUpdate: {
          mutations: [{ payload: { commentEntityPayload: { author: {}, avatar } } }],
        },
      },
    }
    repairYouTubePayload(payload)
    expect(payload.frameworkUpdates.entityBatchUpdate.mutations[0]
      .payload.commentEntityPayload.avatar).toBe(avatar)
  })

  it('copies subThreads into contents so replies can be found', () => {
    const subThreads = [{ continuationItemRenderer: { token: 'abc' } }]
    const payload = { commentRepliesRenderer: { contents: [], subThreads } }
    repairYouTubePayload(payload)
    expect(payload.commentRepliesRenderer.contents).toBe(subThreads)
  })

  it('does not clobber contents that are already populated', () => {
    const contents = [{ real: true }]
    const payload = {
      commentRepliesRenderer: { contents, subThreads: [{ other: true }] },
    }
    repairYouTubePayload(payload)
    expect(payload.commentRepliesRenderer.contents).toBe(contents)
  })

  it('repairs nodes nested anywhere in the response', () => {
    const payload = {
      a: { b: [{ c: { commentRepliesRenderer: { contents: [], subThreads: [{ t: 1 }] } } }] },
    }
    repairYouTubePayload(payload)
    expect(payload.a.b[0].c.commentRepliesRenderer.contents).toHaveLength(1)
  })

  it('ignores payloads with nothing to repair', () => {
    expect(() => repairYouTubePayload({ unrelated: 'data' })).not.toThrow()
    expect(() => repairYouTubePayload(null)).not.toThrow()
    expect(() => repairYouTubePayload('string')).not.toThrow()
  })
})
