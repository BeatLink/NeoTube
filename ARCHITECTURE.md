# NeoTube — Architecture Diagram

```mermaid
graph TB
    subgraph Shared["Shared React Frontend (src/)"]
        UI[Pages & Components]
        PM[PluginManager]
        DB[(PouchDB)]
        UI --> PM
        UI --> DB
    end

    subgraph Plugins["Video Plugins (src/plugins/)"]
        YTJS[YoutubeJsPlugin\nuses window.ytjs]
        YTDLP[YtdlpPlugin\nuses window.ytdlp]
        INV[InvidiousPlugin\nuses window.invidious or fetch]
        PM --> YTJS & YTDLP & INV
    end

    subgraph Electron["Desktop — Electron"]
        PRE[preload.ts\ncontextBridge\nwindow.ytjs / ytdlp / invidious]
        MAIN[main.ts\nipcMain handlers]
        HANDLERS[ytjs-handlers.ts\nInnertube logic]
        PRE -->|IPC invoke| MAIN --> HANDLERS
        HANDLERS -->|youtubei.js| YT[(YouTube)]
        MAIN -->|yt-dlp binary| YT
        MAIN -->|fetch| INV_API[(Invidious API)]
    end

    subgraph Capacitor["Mobile — Capacitor (Android / iOS)"]
        BRIDGE[src/capacitor/ytjs-bridge.ts\nwindow.ytjs via NodeJS channel]
        NODE[nodejs-project/main.js\nchannel IPC wrapper]
        HBUNDLE[public/nodejs/handlers.js\nbundled ytjs-handlers.ts]
        BRIDGE -->|NodeJS.send| NODE --> HBUNDLE
        HBUNDLE -->|youtubei.js| YT
        INV -->|fetch native| INV_API
    end

    YTJS -->|window.ytjs| PRE
    YTJS -->|window.ytjs| BRIDGE
    YTDLP -->|window.ytdlp| PRE
    INV -->|window.invidious| MAIN

    subgraph Build["Build Pipeline"]
        B1["build:electron:main\nesbuild electron/main.ts → dist-electron/"]
        B2["build:node-backend\nesbuild electron/ytjs-handlers.ts → public/nodejs/handlers.js"]
        B3["build:android\nbuild + node-backend + cap copy android"]
    end
```

## Key reuse points

- **`electron/ytjs-handlers.ts`** — single source of truth for all Innertube / youtubei.js logic.
  Built into the Electron main process bundle and separately bundled into
  `public/nodejs/handlers.js` for the Android/iOS Node.js thread.

- **`src/plugins/youtubejs/index.ts`** — unchanged across platforms; reads `window.ytjs`
  regardless of whether it was set by the Electron preload or the Capacitor bridge.

- **All React UI, routing, PouchDB, and plugin interfaces** — fully shared across
  Electron, Android, iOS, and the web build.

## Platform feature matrix

| Feature | Electron | Android / iOS | Web |
|---------|----------|---------------|-----|
| youtube.js (Innertube) | ✅ IPC → main process | ✅ capacitor-nodejs thread | ❌ |
| yt-dlp | ✅ IPC → local binary | ❌ | ❌ |
| Invidious | ✅ IPC fetch (no CORS) | ⚠️ direct fetch (CORS varies) | ⚠️ direct fetch (CORS varies) |
| PouchDB local storage | ✅ | ✅ | ✅ |
| P2P sync | ✅ | ✅ | ✅ |
