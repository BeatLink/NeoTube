# NeoTube — Architecture Diagram

```mermaid
graph TB
    %% ── Frontend ─────────────────────────────────────────────────────────────
    subgraph FE["Frontend — React renderer  (src/)  ·  same code on all platforms"]
        direction TB
        UI[Pages & Components]
        PM[PluginManager]
        DB[(PouchDB)]
        UI --> PM & DB

        subgraph Plugins["src/plugins/"]
            YTJS[YoutubeJsPlugin]
            YTDLP_P[YtdlpPlugin]
            PM --> YTJS & YTDLP_P
        end

        IT["innertube.ts
        Innertube singleton
        (youtubei.js)"]
        YTJS --> IT
    end

    %% ── Electron backend ─────────────────────────────────────────────────────
    subgraph BE_E["Backend — Electron main process  (electron/)"]
        CORS["session.webRequest
        ① strip Origin header
        ② inject Access-Control-Allow-Origin: *
        ③ force OPTIONS → 200"]
        IPC["ipcMain handlers
        yt-dlp · avatar · FreeTube"]
        PRE["preload.ts  (contextBridge)
        window.ytdlp  window.freetube  window.electron"]
    end

    %% ── Capacitor native layer ───────────────────────────────────────────────
    subgraph BE_C["Native layer — Capacitor  (Android / iOS)"]
        CAP["CapacitorHttp
        native HTTP — bypasses WebView CORS"]
    end

    %% ── External ─────────────────────────────────────────────────────────────
    YT[(YouTube)]

    %% ── Edges ────────────────────────────────────────────────────────────────
    IT -- "fetch()  →  transparent via CORS middleware" --> CORS --> YT
    IT -- "capacitorFetch()  →  no CORS restriction" --> CAP --> YT
    YTDLP_P -- "window.ytdlp" --> PRE -- "IPC invoke" --> IPC -- "yt-dlp binary" --> YT
```

## Frontend vs backend

| Layer | What runs there |
|-------|----------------|
| **Frontend** (renderer / WebView) | All React UI, PluginManager, PouchDB, YoutubeJsPlugin, YtdlpPlugin, Innertube client (`innertube.ts`) |
| **Electron backend** (main process) | `session.webRequest` CORS middleware, yt-dlp IPC, avatar download IPC, FreeTube import IPC |
| **Capacitor native** | `CapacitorHttp` — native HTTP plugin, no WebView CORS restrictions |

## Key design points

- **youtube.js runs in the frontend on every platform.** CORS is solved at the platform layer, not by moving code to the backend: Electron intercepts HTTP responses in the main process to inject CORS headers; Capacitor routes requests through native HTTP.

- **`src/plugins/youtubejs/innertube.ts`** — detects the platform at runtime and passes a `CapacitorHttp` fetch wrapper to the Innertube constructor on mobile. On Electron the default `fetch` is used (CORS already fixed).

- **yt-dlp stays backend-only.** It's a local binary that can only be invoked from the Electron main process, so it remains behind an IPC bridge (`window.ytdlp → preload → ipcMain`).

## Platform feature matrix

| Feature | Electron | Android / iOS | Web |
|---------|----------|---------------|-----|
| youtube.js (Innertube) | ✅ frontend + session CORS | ✅ frontend + CapacitorHttp | ⚠️ CORS blocked |
| yt-dlp | ✅ IPC → local binary | ❌ | ❌ |
| PouchDB local storage | ✅ | ✅ | ✅ |
| P2P sync | ✅ | ✅ | ✅ |
