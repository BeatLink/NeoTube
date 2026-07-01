import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { pluginManager } from './plugins/manager'
import { YtdlpPlugin } from './plugins/ytdlp/index'

// Register all plugins — add Invidious / youtube.js here when ready
pluginManager.register(new YtdlpPlugin())

// Select the best available plugin for this environment
pluginManager.autoSelect().catch(() => {
  console.warn('No video plugins available in this environment')
})

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
