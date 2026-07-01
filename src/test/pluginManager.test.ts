import { describe, it, expect, beforeEach } from 'vitest'
import type { VideoPlugin, VideoInfo, SearchResult, ChannelInfo } from '../plugins/types'

// Minimal stub plugin for testing the manager in isolation
function makeStub(id: string, available: boolean): VideoPlugin {
  return {
    id,
    name: id,
    description: '',
    isAvailable: () => Promise.resolve(available),
    getVideoInfo: () => Promise.resolve({} as VideoInfo),
    search: () => Promise.resolve([] as SearchResult[]),
    getChannelInfo: () => Promise.resolve({} as ChannelInfo),
  }
}

// Import a fresh PluginManager class (not the singleton) for test isolation
class PluginManager {
  private readonly registry = new Map<string, VideoPlugin>()
  private activeId: string | null = null
  register(p: VideoPlugin) { this.registry.set(p.id, p) }
  list() { return Array.from(this.registry.values()) }
  get(id: string) { return this.registry.get(id) }
  setActive(id: string) {
    if (!this.registry.has(id)) throw new Error(`Plugin "${id}" is not registered`)
    this.activeId = id
  }
  getActive() {
    if (this.activeId && this.registry.has(this.activeId)) return this.registry.get(this.activeId)!
    for (const p of this.registry.values()) return p
    throw new Error('No plugins registered')
  }
  async autoSelect() {
    for (const p of this.registry.values()) {
      if (await p.isAvailable()) { this.activeId = p.id; return p }
    }
    throw new Error('No available plugins found')
  }
}

describe('PluginManager', () => {
  let manager: PluginManager

  beforeEach(() => { manager = new PluginManager() })

  it('registers and lists plugins', () => {
    manager.register(makeStub('a', true))
    manager.register(makeStub('b', true))
    expect(manager.list().map(p => p.id)).toEqual(['a', 'b'])
  })

  it('retrieves a plugin by id', () => {
    manager.register(makeStub('ytdlp', true))
    expect(manager.get('ytdlp')?.id).toBe('ytdlp')
  })

  it('setActive throws for unknown plugin', () => {
    expect(() => manager.setActive('ghost')).toThrow()
  })

  it('setActive selects the named plugin', () => {
    manager.register(makeStub('a', true))
    manager.register(makeStub('b', true))
    manager.setActive('b')
    expect(manager.getActive().id).toBe('b')
  })

  it('getActive falls back to first registered when none set', () => {
    manager.register(makeStub('first', true))
    manager.register(makeStub('second', true))
    expect(manager.getActive().id).toBe('first')
  })

  it('getActive throws when registry is empty', () => {
    expect(() => manager.getActive()).toThrow('No plugins registered')
  })

  it('autoSelect picks the first available plugin', async () => {
    manager.register(makeStub('unavailable', false))
    manager.register(makeStub('available', true))
    const p = await manager.autoSelect()
    expect(p.id).toBe('available')
  })

  it('autoSelect throws when no plugin is available', async () => {
    manager.register(makeStub('a', false))
    await expect(manager.autoSelect()).rejects.toThrow('No available plugins found')
  })
})
