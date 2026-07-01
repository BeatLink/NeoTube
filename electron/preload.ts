import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
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
