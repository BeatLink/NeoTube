import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
  downloadAvatar: (url: string): Promise<string> =>
    ipcRenderer.invoke('avatar:download', url),
})

contextBridge.exposeInMainWorld('freetube', {
  scan: (): Promise<string[]> =>
    ipcRenderer.invoke('freetube:scan'),
  readData: (dir: string): Promise<{
    subscriptions: Array<{ id: string; name: string; thumbnail: string }>
    history: Array<{
      videoId: string; title: string; channelId: string; channelName: string
      thumbnail: string; duration: number; watchedAt: string
    }>
  }> => ipcRenderer.invoke('freetube:readData', dir),
})

contextBridge.exposeInMainWorld('ytdlp', {
  getInfo: (videoId: string) =>
    ipcRenderer.invoke('ytdlp:info', videoId),
  search: (query: string, limit?: number) =>
    ipcRenderer.invoke('ytdlp:search', query, limit ?? 10),
  getChannelInfo: (channelId: string) =>
    ipcRenderer.invoke('ytdlp:channelInfo', channelId),
  getChannelVideos: (channelId: string, limit?: number) =>
    ipcRenderer.invoke('ytdlp:channelVideos', channelId, limit ?? 30),
  getChannelPlaylists: (channelId: string, limit?: number) =>
    ipcRenderer.invoke('ytdlp:channelPlaylists', channelId, limit ?? 20),
})

contextBridge.exposeInMainWorld('ytjs', {
  getInfo: (videoId: string) =>
    ipcRenderer.invoke('ytjs:info', videoId),
  search: (query: string, limit?: number) =>
    ipcRenderer.invoke('ytjs:search', query, limit ?? 10),
  getChannelInfo: (channelId: string) =>
    ipcRenderer.invoke('ytjs:channelInfo', channelId),
  getChannelVideos: (channelId: string, limit?: number) =>
    ipcRenderer.invoke('ytjs:channelVideos', channelId, limit ?? 30),
  getChannelPlaylists: (channelId: string, limit?: number) =>
    ipcRenderer.invoke('ytjs:channelPlaylists', channelId, limit ?? 20),
})
