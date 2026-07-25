# NeoTube — Development Guide

## Overview

NeoTube is a free, open source, privacy-respecting YouTube client. It allows users to browse and watch YouTube content without being tracked by Google.

---

## Architecture

NeoTube uses a **client–server model**. A standalone Node.js server (Fastify + PouchDB + youtubei.js + yt-dlp) runs on the user's machine or LAN and exposes a REST API. The client is a React/Vite UI (`src/`) that calls the API; it runs in the browser and is packaged as a desktop app by an Electron shell (`electron/`).

### System diagram

```mermaid
graph TB
    %% ── Server ─────────────────────────────────────────────────────────────
    subgraph SRV["Server — Node.js daemon  (server/)  · port 7700"]
        direction TB
        FW[Fastify HTTP server]
        DB[(PouchDB / LevelDB\n~/.neotube/db)]
        IT["Innertube\n(youtubei.js)"]
        YD[yt-dlp binary]

        FW --> DB & IT & YD
    end

    %% ── Client ────────────────────────────────────────────────────────────
    subgraph CLI["Client — React / Vite  (src/)"]
        direction TB
        UI_B[Browser]
        UI_E[Electron desktop app\n(electron/ wraps src/)]
    end

    %% ── External ──────────────────────────────────────────────────────────
    YT[(YouTube)]

    %% ── Edges ─────────────────────────────────────────────────────────────
    UI_B & UI_E -- "fetch /api/*" --> FW
    IT --> YT
    YD --> YT
```

### Layer responsibilities

| Layer | What runs there |
|-------|----------------|
| **Server** | Fastify REST API, PouchDB storage, Innertube (youtubei.js), yt-dlp spawn |
| **React UI** (`src/`) | The client; runs in the browser and inside Electron; calls the REST API |
| **Electron** (`electron/`) | Desktop shell hosting the React UI; exposes desktop-only bridges (e.g. FreeTube import) via preload |

### Key design points

- **youtube.js lives on the server.** It's a JS library that needs a real Node.js environment (no CORS, no WebView sandboxing). The client receives structured JSON from the API.
- **yt-dlp is server-side only.** The binary is spawned from the Fastify process; the client calls `/api/video/:id?backend=ytdlp`.
- **PouchDB is the server's source of truth.** Subscriptions, history, settings, and channel caches are stored in LevelDB via PouchDB. The `/api/sync` endpoint triggers one-shot replication to a CouchDB-compatible remote (optional).
- **Electron adds desktop-only capabilities.** `electron/preload.ts` exposes bridges (e.g. FreeTube data import) on `window.*`; pages feature-detect them and degrade gracefully in the browser.

### REST API contract

```
# Video & search
GET  /api/video/:id?backend=youtubejs|ytdlp
GET  /api/search?q=&limit=&backend=

# Channel
GET  /api/channel/:id?backend=
GET  /api/channel/:id/videos?limit=&backend=
GET  /api/channel/:id/playlists?backend=
GET  /api/channel-cache/:channelId          (cached video list)
PUT  /api/channel-cache/:channelId          body: CachedVideo[]

# Storage
GET    /api/settings
PATCH  /api/settings                        body: Partial<UserSettings>
GET    /api/subscriptions
POST   /api/subscriptions                   body: { channelId, name, thumbnail? }
DELETE /api/subscriptions/:channelId
GET    /api/subscriptions/:channelId/status
GET    /api/history
POST   /api/history                         body: { videoId, title, channelId, channelName, thumbnail?, duration? }
DELETE /api/history/:videoId
DELETE /api/history                         (clear all)

# Utilities
GET    /api/proxy?url=                      streams image bytes (YouTube hosts only)
POST   /api/sync                            body: { remoteUrl } — PouchDB replication
GET    /api/health                          → { ok: true, version }
```

---

## Platform Targets

| Platform | Stack |
|----------|-------|
| Desktop | Electron + React (`src/`) → Linux / macOS / Windows |
| Web | React (`src/`) in the browser → any modern browser |

---

## Directory Structure

```
NeoTube/
├── server/                    # Standalone Node.js REST API server
│   └── src/
│       ├── index.ts           # Fastify instance, CORS, optional API key, startup
│       ├── db.ts              # PouchDB CRUD (settings, subscriptions, history, cache)
│       ├── innertube.ts       # Innertube singleton (youtube.js)
│       ├── ytdlp.ts           # yt-dlp spawn helpers
│       ├── types.ts           # Shared response types
│       └── routes/
│           ├── video.ts       # /api/search, /api/video/:id
│           ├── channel.ts     # /api/channel/* + channel cache
│           ├── subscriptions.ts
│           ├── history.ts
│           ├── settings.ts
│           ├── proxy.ts       # /api/proxy?url= — image proxy
│           └── sync.ts        # /api/sync — PouchDB replication
│
├── electron/                  # Electron desktop shell wrapping the React UI
│   ├── main.ts                # Main process — window, server bridge, FreeTube import
│   ├── preload.ts             # Exposes desktop-only bridges on window.*
│   └── tsconfig.json
│
├── src/                       # React UI — the app client (browser + Electron)
│   ├── App.tsx                # React Router routes + Layout shell
│   ├── components/            # Shared UI (Button, VideoCard, PageLayout, …)
│   ├── pages/                 # Home, Search, Watch, Channel, Subscriptions, Channels, History, Settings
│   ├── plugins/               # Plugin system (youtubejs + ytdlp)
│   ├── db/                    # PouchDB access layer (browser)
│   ├── contexts/ hooks/ services/ utils/ types/
│   └── …
│
├── capacitor.config.ts        # Capacitor config (mobile packaging)
├── shell.nix                  # Nix dev shell: nodejs_22, electron, yt-dlp
├── flake.nix                  # Nix flake
└── package.nix                # Nix package definition
```

---

## Tech Stack

| Concern | Technology |
|---------|-----------|
| Server framework | Fastify 5 |
| Server DB | PouchDB 9 (LevelDB via `pouchdb`) |
| YouTube data | youtubei.js 17 |
| Video download | yt-dlp |
| Client UI | React 19 |
| Desktop shell | Electron |
| React bundler | Vite 8 |
| React routing | React Router 7 |
| React testing | Vitest + Testing Library |
| Linting | oxlint |
| Dev environment | Nix (flake + shell.nix) |

---

## Running Locally

```bash
# Enter Nix dev shell (provides node, electron, yt-dlp)
nix-shell

# Start the REST API server
cd server && npm install && npm run dev
# → http://localhost:7700

# Run the Electron desktop app (React UI + Electron shell)
npm install && npm run dev:electron

# Or run the React UI in the browser
npm run dev
```

---

## Features

### Playback
- Video playback via pluggable backend (yt-dlp or youtube.js)
- Quality selection from available streams
- Watch page: title, channel link, subscribe button, view count, collapsible description
- YouTube cookie auth (Settings → YouTube Account): paste session cookie to unlock 720p+ adaptive streams via youtube.js

### Search & Browse
- Universal topbar: video URL → Watch, channel URL → Channel page, search term → results
- Search results with thumbnail, duration, channel name (linked), view count
- Previously-watched indicator on search results (normal / dim / hide, per Settings)
- Channel page: avatar, name, subscriber count, collapsible description, subscribe button
- Channel page tabs: Videos and Playlists
- Previously-watched indicator on channel video grid

### Subscriptions
- Subscribe / unsubscribe from Watch page and Channel page
- Subscriptions stored in PouchDB (server-side); sorted alphabetically
- **Subscriptions feed** (`/subscriptions`): recent videos from all subscribed channels
- **Channels grid** (`/channels`): card grid of subscribed channels

### Watch History
- Every watched video is recorded to PouchDB
- History page: responsive grid, relative timestamps, per-video remove, clear all
- Previously-watched video style (Normal / Dim / Hide) in Settings

### Data Import
- **FreeTube import** (Electron, Desktop only): imports subscriptions and watch history

### Settings
- Light / dark theme
- Active backend selector (yt-dlp, youtube.js)
- Previously watched video style (Normal / Dim / Hide)
- YouTube session cookie: stored in PouchDB, restored on server startup

---

## Privacy Model

_To be defined._

---

## Roadmap

### Phase 1 — Foundation ✓
- [x] Nix dev environment (flake, shell.nix, package.nix)
- [x] Vite + React + TypeScript scaffold
- [x] React Router with page skeleton
- [x] PouchDB data layer + types
- [x] Settings stored in PouchDB (theme, quality, privacy mode)
- [x] Light / dark theme toggle
- [x] Electron skeleton (main + preload)
- [x] Capacitor config

### Phase 2 — Plugin System & yt-dlp ✓
- [x] `VideoPlugin` interface
- [x] `PluginManager` with registration, lookup, and auto-select
- [x] yt-dlp plugin — Electron IPC bridge to local binary
- [x] VideoPlayer component with quality selector
- [x] Watch page wired to active plugin

### Phase 3 — youtube.js Plugin ✓
- [x] youtube.js plugin — runs in renderer; CORS via `session.webRequest` on Electron, `CapacitorHttp` on mobile
- [x] YouTube cookie auth for 720p+ adaptive streams
- [x] Plugin selector in Settings page

### Phase 4 — Search & Browse ✓
- [x] Topbar search (URL → Watch, query → Search results)
- [x] Search results page with thumbnail, duration, channel
- [x] Channel page with avatar, subscriber count, subscribe button
- [x] Channel page Videos and Playlists tabs

### Phase 5 — Subscriptions & History ✓
- [x] Subscribe / unsubscribe
- [x] Subscriptions stored in PouchDB
- [x] Subscription feed and Channels grid pages
- [x] Watch history stored in PouchDB
- [x] History page with grid, timestamps, remove, clear all
- [x] Previously-watched style setting

### Phase 6 — Data Import ✓ (partial)
- [x] FreeTube import (subscriptions + watch history, Desktop only)
- [ ] OPML / CSV subscription export
- [ ] Generic watch history export

### Phase 6.5 — UI Component System ✓
- [x] Centralised `Button`, `MenuButton`, `ToggleButton`, `VideoCard`, `VideoThumbnail` components
- [x] `src/utils/format.ts` — shared `formatDuration` + `timeAgo`
- [x] `src/services/videoCache.ts` — stale-while-revalidate cache

### Phase 7 — REST API Server ✓
- [x] Fastify server in `server/` — video, channel, subscriptions, history, settings, proxy, sync routes
- [x] PouchDB (LevelDB) persistence on server
- [x] Innertube singleton on server (no CORS, no workarounds)
- [x] Optional API key authentication
- [x] Image proxy endpoint (`/api/proxy`)
- [x] PouchDB → CouchDB sync endpoint (`/api/sync`)
- [x] Health check endpoint

### Phase 8 — Electron Desktop App ✓
- [x] Electron shell (`electron/main.ts` + `electron/preload.ts`) wrapping the React UI
- [x] All pages: Home (feed), Search, Watch, Channel, Subscriptions, Channels, History, Settings
- [x] FreeTube import bridge (subscriptions + history) exposed via preload
- [x] Flutter native client removed — React + Electron is the single client

### Phase 9 — Production Hardening
- [ ] Electron: package installers via electron-builder (AppImage / dmg / nsis)
- [ ] Electron: bundle the server + node runtime alongside the app for distribution
- [ ] Server: systemd service unit file
- [ ] Privacy mode (no history stored)
- [ ] Default quality preference
- [ ] P2P sync between devices via PouchDB replication
