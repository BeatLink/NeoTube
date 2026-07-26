// Cached accessors for channel and video metadata.
//
// Pages should use these rather than calling the plugin directly, so every read
// goes through the cache first and only misses hit the network.

import { getOrFetchMetadata } from '../db/metadata'
import { pluginManager } from '../plugins/manager'
import type { ChannelInfo, VideoInfo } from '../plugins/types'

export function getChannelInfoCached(channelId: string): Promise<ChannelInfo> {
  return getOrFetchMetadata<ChannelInfo>('channel', channelId, () =>
    pluginManager.getActive().getChannelInfo(channelId),
  )
}

/**
 * Cached video metadata.
 *
 * Stream URLs are deliberately excluded: they are signed and expire within
 * hours, so caching them would hand back dead links. The Watch page fetches
 * playback data separately.
 */
export function getVideoInfoCached(videoId: string): Promise<Omit<VideoInfo, 'streams'>> {
  return getOrFetchMetadata('video', videoId, async () => {
    const { streams: _streams, ...rest } = await pluginManager.getActive().getVideoInfo(videoId)
    return rest
  })
}
