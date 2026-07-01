import type { VideoPlugin } from './types'

class PluginManager {
  private readonly registry = new Map<string, VideoPlugin>()
  private activeId: string | null = null

  register(plugin: VideoPlugin): void {
    this.registry.set(plugin.id, plugin)
  }

  list(): VideoPlugin[] {
    return Array.from(this.registry.values())
  }

  get(id: string): VideoPlugin | undefined {
    return this.registry.get(id)
  }

  setActive(id: string): void {
    if (!this.registry.has(id)) throw new Error(`Plugin "${id}" is not registered`)
    this.activeId = id
  }

  getActive(): VideoPlugin {
    if (this.activeId && this.registry.has(this.activeId)) {
      return this.registry.get(this.activeId)!
    }
    // Fall back to first available plugin
    for (const plugin of this.registry.values()) {
      return plugin
    }
    throw new Error('No plugins registered')
  }

  /** Checks availability and sets the first available plugin as active */
  async autoSelect(): Promise<VideoPlugin> {
    for (const plugin of this.registry.values()) {
      if (await plugin.isAvailable()) {
        this.activeId = plugin.id
        return plugin
      }
    }
    throw new Error('No available plugins found')
  }
}

// Singleton — import this everywhere
export const pluginManager = new PluginManager()
