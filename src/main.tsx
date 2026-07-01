import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { pluginManager } from './plugins/manager'
import { YtdlpPlugin } from './plugins/ytdlp/index'
import { YoutubeJsPlugin } from './plugins/youtubejs/index'
import { getSettings } from './db/index'

// Register all plugins — add Invidious here when ready
pluginManager.register(new YoutubeJsPlugin())
pluginManager.register(new YtdlpPlugin())

// Restore the user's saved plugin choice, falling back to auto-select
getSettings()
  .then(settings => {
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
