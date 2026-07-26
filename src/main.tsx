import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import 'shaka-player/dist/controls.css'
import './index.css'
import App from './App.tsx'
import { pluginManager } from './plugins/manager'
import { YoutubeJsPlugin } from './plugins/youtubejs/index'
import { getSettings, stripInlinedThumbnails } from './db/index'
import { startRefresher } from './services/refresher'

pluginManager.register(new YoutubeJsPlugin())

// Reclaim space from the old base64-thumbnail scheme. Runs in the background:
// nothing on screen depends on it, and it no-ops once the data is clean.
stripInlinedThumbnails().catch(() => {})

// Keeps cached channel/video metadata warm. Starts after a delay and works in
// small batches, so it never competes with what the user is actually loading.
startRefresher()

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

