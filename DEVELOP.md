# NeoTube — Development Plan

## Overview

NeoTube is a free, open source, privacy-respecting YouTube client. It allows users to browse and watch YouTube content without being tracked by Google.

---

## Architecture

NeoTube is a peer-to-peer application — there is no central server. Each instance of the app is a self-contained node that communicates directly with other instances. User data (subscriptions, history, preferences, etc.) is stored in a local PouchDB database on the device and synced peer-to-peer with the user's other devices or trusted peers.

### Platform Targets

| Platform | Runtime |
|----------|---------|
| Web | React + Vite (served via Node) |
| Mobile | React + Capacitor (Android / iOS) |
| Desktop | React + Electron |

The React frontend is shared across all three targets. Platform-specific code is isolated to the Capacitor and Electron layers.

### Data Layer

- Each device runs a local **PouchDB** instance as its source of truth.
- Devices sync with each other directly using PouchDB's built-in replication protocol.
- No central database or sync server is required.
- Key prefix strategy: `sub-<channelId>` for subscriptions, `history-<videoId>` for watch history.
- Channel avatars are stored as base64 data URIs (downloaded via Electron main process to avoid CORS).

### Plugin System

Video data (metadata, stream URLs, search) is fetched through a plugin. Each plugin implements the `VideoPlugin` interface and is registered with the `PluginManager` singleton at startup. The manager auto-selects the first available plugin for the current environment.

| Plugin | Transport | Availability |
|--------|-----------|-------------|
| `ytdlp` | Electron IPC → local `yt-dlp` binary | Desktop only |
| `youtubejs` | Electron IPC → Innertube (main process, Node vm for decipher) | Desktop only |
| `invidious` | HTTP to a user-configured Invidious instance | All platforms _(planned)_ |

Adding a new backend = implementing `VideoPlugin` in `src/plugins/<name>/index.ts` and calling `pluginManager.register(new MyPlugin())` in `src/main.tsx`.

### Directory Structure

```
NeoTube/
├── electron/              # Electron main + preload (desktop wrapper)
│   ├── main.ts            # IPC handlers (avatar download, yt-dlp, youtubejs, freetube, window)
│   ├── preload.ts         # contextBridge API surface
│   │                      #   window.electron  — platform info + downloadAvatar
│   │                      #   window.ytdlp     — yt-dlp bridge
│   │                      #   window.ytjs      — youtube.js bridge
│   │                      #   window.freetube  — FreeTube data import
│   └── tsconfig.json
├── src/
│   ├── components/        # Shared UI components (each in its own subfolder)
│   │   ├── Button/        # Base button (variants: primary, secondary, ghost, danger; sizes: sm, md)
│   │   ├── Layout/        # App shell: sidebar, topbar, startup avatar refresh
│   │   ├── MenuButton/    # Segmented control group (e.g. sort mode, quality selector)
│   │   ├── ToggleButton/  # Toggle button with active state, built on Button base classes
│   │   ├── VideoCard/     # Video list item: thumbnail + title + channel + meta (renders as <li>)
│   │   ├── VideoPlayer/   # HTML5 video player with quality selector
│   │   └── VideoThumbnail/ # 16:9 thumbnail wrapper with duration badge
│   ├── contexts/          # React contexts (ThemeContext)
│   ├── db/                # PouchDB access layer (lazy singleton)
│   │   └── index.ts       # Settings, subscriptions, watch history CRUD
│   ├── pages/             # Page-level components
│   │   ├── Home.tsx           # Landing page
│   │   ├── Watch.tsx          # Video player (route: /watch/:videoId)
│   │   ├── Search.tsx         # Search results (route: /search?q=...)
│   │   ├── Channel.tsx        # Channel page — info, videos, playlists tabs (route: /channel/:channelId)
│   │   ├── Subscriptions.tsx  # Subscription feed — videos from all subscribed channels (route: /subscriptions)
│   │   ├── Channels.tsx       # Subscribed channel grid with search filter (route: /channels)
│   │   ├── History.tsx        # Watch history grid (route: /history)
│   │   └── Settings.tsx       # Theme, plugin, watched-video style, FreeTube import
│   ├── plugins/           # Video backend plugin system
│   │   ├── types.ts       # VideoPlugin interface + shared domain types
│   │   ├── manager.ts     # PluginManager singleton
│   │   ├── ytdlp/         # yt-dlp plugin (Electron IPC)
│   │   └── youtubejs/     # youtube.js plugin (Electron IPC via Innertube)
│   ├── services/
│   │   └── videoCache.ts  # Stale-while-revalidate channel video cache
│   │                      #   getOrFetchChannelVideos — serve cache + background refresh via onFresh callback
│   │                      #   refreshChannelVideos    — force fetch, awaitable (used by batch feed loader)
│   │                      #   cacheHistoryThumbnails  — batch blob download with onEach progress callback
│   ├── test/              # Vitest test files + setup
│   ├── types/             # Shared TypeScript types (index.ts, pouchdb-browser.d.ts)
│   └── utils/
│       ├── avatar.ts      # downloadAvatar — fetches image blob via Electron IPC
│       ├── format.ts      # formatDuration, timeAgo — shared time/duration formatting
│       └── youtube.ts     # parseVideoId — extracts video ID from any YouTube URL form
├── public/                # Static assets
├── capacitor.config.ts    # Capacitor (mobile) configuration
├── vite.config.ts         # Vite + Vitest configuration
├── flake.nix              # Nix flake (reproducible builds)
├── shell.nix              # Nix dev shell (includes yt-dlp, electron)
└── package.nix            # Nix package definition
```

### UI Layout

```
┌─────────────────┬──────────────────────────────────────────────┐
│                 │  [Search or paste a YouTube URL…]  [Search]  │ ← topbar
│  • Home         ├──────────────────────────────────────────────┤
│  • Subscriptions│                                              │
│  • Channels     │   <page content (Outlet)>                    │ ← content
│  • History      │                                              │
│  • Settings     │                                              │
│  ─────────────  │                                              │
│  Channels       │                                              │
│  • Channel A    │                                              │
│  • Channel B    │                                              │
│  • …            │                                              │
└─────────────────┴──────────────────────────────────────────────┘
```

The topbar search input accepts:
- **YouTube URL** → navigates directly to `/watch/:videoId`
- **Search term** → navigates to `/search?q=...`

The sidebar channel list is sorted alphabetically and scrollable (scrollbar hidden until hover).

---

## Tech Stack

| Concern | Technology |
|---------|-----------|
| Frontend | React 19 + TypeScript |
| Bundler | Vite 8 |
| Routing | React Router 7 |
| Local database | PouchDB 9 (pouchdb-browser) |
| P2P sync | PouchDB replication |
| Video backend | Plugin system (yt-dlp / Invidious / youtube.js) |
| Mobile wrapper | Capacitor 8 |
| Desktop wrapper | Electron 43 |
| Testing | Vitest + Testing Library |
| Linting | oxlint |
| Dev environment | Nix (flake + shell.nix) |

---

## Features

### Playback
- Video playback via pluggable backend (yt-dlp or youtube.js on Desktop)
- Quality selection from available streams
- Watch page: title, channel link, subscribe button, view count, collapsible description

### Search & Browse
- Universal topbar search: YouTube URL → direct watch, search term → results page
- Search results with thumbnail, duration, channel name (linked), view count
- Previously-watched indicator on search results (normal / dim / hide, per Settings)
- Channel page: avatar, name, subscriber count, collapsible description, subscribe button
- Channel page tabs: Videos and Playlists
- Previously-watched indicator on channel video grid

### Subscriptions
- Subscribe / unsubscribe from Watch page and Channel page
- Subscriptions stored in PouchDB, sorted alphabetically
- **Subscriptions feed** (`/subscriptions`): recent videos from all subscribed channels, loaded in parallel batches; sort "By channel" (grouped) or "By date" (flat chronological); "Unwatched only" toggle
- **Channels grid** (`/channels`): card grid of subscribed channels with avatar, filter search, unsubscribe button
- Sidebar: subscribed channels listed with avatar (scrollbar hidden until hover)
- Channel avatars stored as base64 blobs (no broken CDN links)
- Avatar refresh on startup (sequential, 800 ms between requests) and on every channel page visit

### Watch History
- Every watched video is recorded to PouchDB (`history-<videoId>` prefix)
- Re-watching increments `watchCount` and updates `watchedAt` timestamp
- History page (`/history`): responsive grid, relative timestamps, per-video remove, clear all
- Previously-watched video style (Normal / Dim / Hide) in Settings — applied to Search, Channel, and Subscriptions feed

### Data Import
- **FreeTube import** (Settings page, Desktop only): auto-detects FreeTube data directory (native, Flatpak, Snap, Windows, macOS); imports subscriptions and watch history; background avatar download after import

### Settings
- Light / dark theme, persisted in PouchDB and cached in localStorage
- Active plugin selector (yt-dlp or youtube.js)
- Previously watched video style (Normal / Dim / Hide)
- FreeTube data import

---

## Privacy Model

_To be defined._

---

## UI/UX Design

_To be defined._

---

## Data Flow

_To be defined._

---

## Deployment

_To be defined._

---

## Roadmap

### Phase 1 — Foundation ✓
- [x] Nix dev environment (flake, shell.nix, package.nix)
- [x] Vite + React + TypeScript scaffold
- [x] React Router with page skeleton (Home, Watch, Subscriptions, Settings)
- [x] PouchDB data layer + types (lazy singleton, pouchdb-browser)
- [x] Settings stored in PouchDB (theme, quality, privacy mode)
- [x] Light / dark theme toggle persisted to PouchDB + localStorage
- [x] Electron skeleton (main + preload)
- [x] Capacitor config
- [x] .gitignore

### Phase 2 — Plugin System & yt-dlp ✓
- [x] `VideoPlugin` interface (`getVideoInfo`, `search`, `getChannelInfo`)
- [x] `PluginManager` with registration, lookup, and auto-select
- [x] yt-dlp plugin — Electron IPC bridge to local binary
- [x] Electron main process IPC handlers (`ytdlp:info`, `ytdlp:search`)
- [x] VideoPlayer component with quality selector
- [x] Watch page wired to active plugin
- [x] yt-dlp added to Nix dev shell

### Phase 3 — Additional Plugins ✓ (partial)
- [x] youtube.js plugin (Electron IPC via Innertube, Node vm for URL decipher)
- [x] Plugin selector in Settings page
- [ ] Invidious plugin (HTTP, all platforms)
- [ ] Configurable Invidious instance URL

### Phase 4 — Search & Browse ✓
- [x] Topbar search (all pages): URL → Watch, query → Search results
- [x] Search results page with thumbnail, duration, channel name linked to channel page
- [x] Channel page (`/channel/:channelId`) with avatar, subscriber count, subscribe button
- [x] Channel page Videos and Playlists tabs (yt-dlp + youtube.js)
- [x] Thumbnail lazy loading

### Phase 5 — Subscriptions & History ✓
- [x] Subscribe / unsubscribe (Watch page + Channel page)
- [x] Subscriptions stored in PouchDB; sorted alphabetically
- [x] Channels grid page (`/channels`) with avatar, search filter, unsubscribe
- [x] Subscription feed page (`/subscriptions`) with per-channel video sections and unwatched toggle
- [x] Sidebar subscribed channel list (avatar, alphabetical, hover-reveal scrollbar)
- [x] Channel avatars as base64 blobs (startup refresh + channel page visit)
- [x] Watch history stored in PouchDB (`history-<videoId>`, upsert with watchCount)
- [x] History page (`/history`) with grid, timestamps, remove, clear all
- [x] Previously-watched style setting (Normal / Dim / Hide) applied to Search, Channel, Subscriptions feed
- [ ] Playback progress persistence
- [ ] P2P sync between devices via PouchDB replication

### Phase 6 — Data Import / Export ✓ (partial)
- [x] FreeTube import (subscriptions + watch history, Desktop only)
- [ ] OPML / CSV subscription export
- [ ] Generic watch history export

### Phase 6.5 — UI Component System ✓
- [x] Centralised `Button` component (primary / secondary / ghost / danger variants, sm / md sizes)
- [x] `MenuButton` segmented control (sort mode, quality selector)
- [x] `ToggleButton` built on Button base classes
- [x] `VideoCard` component — thumbnail + title + channel + meta as a reusable `<li>` item
- [x] `VideoThumbnail` component — 16:9 wrapper with duration badge
- [x] `src/utils/format.ts` — shared `formatDuration` + `timeAgo` (de-duplicated from 4 pages)
- [x] `src/services/videoCache.ts` — stale-while-revalidate cache with callback API
- [x] All components moved to own subfolders (`ComponentName/ComponentName.tsx` + `index.ts`)
- [x] Pill border-radius (20px) replaced with rounded (8px) throughout

### Phase 7 — Mobile & Desktop Polish
- [ ] Capacitor: add Android + iOS native projects
- [ ] Electron: packaging with electron-builder
- [ ] Responsive / touch-friendly UI
- [ ] Keyboard shortcuts
- [ ] Offline support

### Phase 8 — Privacy & Settings
- [ ] Privacy mode (no history stored)
- [ ] Default quality preference
