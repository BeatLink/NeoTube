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

### Plugin System

Video data (metadata, stream URLs, search) is fetched through a plugin. Each plugin implements the `VideoPlugin` interface and is registered with the `PluginManager` singleton at startup. The manager auto-selects the first available plugin for the current environment.

| Plugin | Transport | Availability |
|--------|-----------|-------------|
| `ytdlp` | Electron IPC → local `yt-dlp` binary | Desktop only |
| `invidious` | HTTP to a user-configured Invidious instance | All platforms _(planned)_ |
| `youtubejs` | youtube.js in-process | All platforms _(planned)_ |

Adding a new backend = implementing `VideoPlugin` in `src/plugins/<name>/index.ts` and calling `pluginManager.register(new MyPlugin())` in `src/main.tsx`.

### Directory Structure

```
NeoTube/
├── electron/              # Electron main + preload (desktop wrapper)
│   ├── main.ts            # IPC handlers (yt-dlp, window management)
│   ├── preload.ts         # contextBridge API surface
│   └── tsconfig.json
├── src/
│   ├── components/        # Shared UI components (Layout, VideoPlayer)
│   ├── db/                # PouchDB access layer (lazy singleton)
│   ├── hooks/             # Custom React hooks (useTheme)
│   ├── pages/             # Page-level components (Home, Watch, Subscriptions, Settings)
│   ├── plugins/           # Video backend plugin system
│   │   ├── types.ts       # VideoPlugin interface + shared domain types
│   │   ├── manager.ts     # PluginManager singleton
│   │   └── ytdlp/         # yt-dlp plugin (Electron)
│   ├── test/              # Vitest test files + setup
│   └── types/             # Shared TypeScript types
├── public/                # Static assets
├── capacitor.config.ts    # Capacitor (mobile) configuration
├── vite.config.ts         # Vite + Vitest configuration
├── flake.nix              # Nix flake (reproducible builds)
├── shell.nix              # Nix dev shell (includes yt-dlp)
└── package.nix            # Nix package definition
```

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

- Light / dark theme, persisted in PouchDB and cached in localStorage
- Video playback via pluggable backend (yt-dlp on Desktop)
- Quality selection from available streams
- Watch page: title, channel, view count, collapsible description

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
- [x] 33 passing tests

### Phase 3 — Additional Plugins
- [ ] Invidious plugin (HTTP, all platforms)
- [ ] youtube.js plugin (in-process, all platforms)
- [ ] Plugin selector in Settings page
- [ ] Configurable Invidious instance URL

### Phase 4 — Search & Browse
- [ ] Search bar (Home page)
- [ ] Search results page
- [ ] Channel pages
- [ ] Thumbnail lazy loading

### Phase 5 — Subscriptions & Sync
- [ ] Subscribe / unsubscribe to channels
- [ ] Subscription feed (latest videos from subscribed channels)
- [ ] Watch history (stored in PouchDB)
- [ ] Playback progress persistence
- [ ] P2P sync between devices via PouchDB replication

### Phase 6 — Mobile & Desktop Polish
- [ ] Capacitor: add Android + iOS native projects
- [ ] Electron: packaging with electron-builder
- [ ] Responsive / touch-friendly UI
- [ ] Keyboard shortcuts
- [ ] Offline support

### Phase 7 — Privacy & Settings
- [ ] Privacy mode (no history stored)
- [ ] Default quality preference
- [ ] Data export / import
