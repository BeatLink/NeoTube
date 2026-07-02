import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { pluginManager } from './plugins/manager'
import { YtdlpPlugin } from './plugins/ytdlp/index'
import { YoutubeJsPlugin } from './plugins/youtubejs/index'
import { InvidiousPlugin } from './plugins/invidious/index'
import { getSettings } from './db/index'

pluginManager.register(new YoutubeJsPlugin())
pluginManager.register(new YtdlpPlugin())
pluginManager.register(new InvidiousPlugin())

// Restore saved plugin + per-plugin config, falling back to auto-select
getSettings()
  .then(settings => {
    if (settings.invidiousInstance) {
      InvidiousPlugin.setInstance(settings.invidiousInstance)
    }
    try {
      pluginManager.setActive(settings.activePlugin)
    } catch {
      pluginManager.autoSelect().catch(() => {})
    }
  })
  .catch(() => pluginManager.autoSelect().catch(() => {}))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
