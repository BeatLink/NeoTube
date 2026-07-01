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

contextBridge.exposeInMainWorld('ytjs', {
  getInfo: (videoId: string) =>
    ipcRenderer.invoke('ytjs:info', videoId),
  search: (query: string, limit?: number) =>
    ipcRenderer.invoke('ytjs:search', query, limit ?? 10),
})
