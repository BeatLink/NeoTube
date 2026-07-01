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

### Directory Structure

```
NeoTube/
├── electron/              # Electron main + preload (desktop wrapper)
│   ├── main.ts
│   ├── preload.ts
│   └── tsconfig.json
├── src/
│   ├── components/        # Shared UI components
│   ├── db/                # PouchDB access layer
│   ├── hooks/             # Custom React hooks
│   ├── pages/             # Page-level components (Home, Watch, Subscriptions, Settings)
│   ├── test/              # Vitest test files + setup
│   └── types/             # Shared TypeScript types
├── public/                # Static assets
├── capacitor.config.ts    # Capacitor (mobile) configuration
├── vite.config.ts         # Vite + Vitest configuration
├── flake.nix              # Nix flake (reproducible builds)
├── shell.nix              # Nix dev shell
└── package.nix            # Nix package definition
```

---

## Tech Stack

| Concern | Technology |
|---------|-----------|
| Frontend | React 19 + TypeScript |
| Bundler | Vite 8 |
| Routing | React Router 7 |
| Local database | PouchDB 9 |
| P2P sync | PouchDB replication |
| Mobile wrapper | Capacitor 8 |
| Desktop wrapper | Electron 43 |
| Testing | Vitest + Testing Library |
| Linting | oxlint |
| Dev environment | Nix (flake + shell.nix) |

---

## Features

_To be defined._

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

### Phase 1 — Foundation (current)
- [x] Nix dev environment (flake, shell.nix, package.nix)
- [x] Vite + React + TypeScript scaffold
- [x] React Router with page skeleton (Home, Watch, Subscriptions, Settings)
- [x] PouchDB data layer + types
- [x] Electron skeleton (main + preload)
- [x] Capacitor config
- [x] Vitest test suite (6 passing tests)
- [x] .gitignore

### Phase 2 — YouTube Data
- [ ] Integrate a YouTube data backend (Invidious or Piped API)
- [ ] Video search
- [ ] Channel pages
- [ ] Video metadata display
- [ ] Thumbnail loading

### Phase 3 — Playback
- [ ] Video player component
- [ ] Quality selection
- [ ] Playback progress persistence (PouchDB)
- [ ] Keyboard shortcuts

### Phase 4 — Subscriptions & Sync
- [ ] Subscribe / unsubscribe to channels
- [ ] Subscription feed (latest videos from subscribed channels)
- [ ] P2P sync between devices via PouchDB replication

### Phase 5 — Mobile & Desktop Polish
- [ ] Capacitor: add Android + iOS native projects
- [ ] Electron: packaging with electron-builder
- [ ] Responsive / touch-friendly UI
- [ ] Offline support

### Phase 6 — Privacy & Settings
- [ ] Privacy mode (no history stored)
- [ ] Theme (light / dark / system)
- [ ] Default quality preference
- [ ] Configurable backend URL (Invidious/Piped instance)
- [ ] Data export / import
