import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electron', {
  platform: process.platform,
})

contextBridge.exposeInMainWorld('ytdlp', {
  getInfo: (videoId: string) =>
    ipcRenderer.invoke('ytdlp:info', videoId),
  search: (query: string, limit?: number) =>
    ipcRenderer.invoke('ytdlp:search', query, limit ?? 10),
})
