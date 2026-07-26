import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { pluginManager } from './plugins/manager'
import { YoutubeJsPlugin } from './plugins/youtubejs/index'
import { getSettings } from './db/index'

pluginManager.register(new YoutubeJsPlugin())

// Restore saved plugin + per-plugin config, falling back to auto-select
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
