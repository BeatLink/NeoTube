# NeoTube — Development Plan

## Overview

NeoTube is a free, open source, privacy-respecting YouTube client. It allows users to browse and watch YouTube content without being tracked by Google.

---

## Architecture

NeoTube is a peer-to-peer application — there is no central server. Each instance of the app is a self-contained node that communicates directly with other instances. User data (subscriptions, history, preferences, etc.) is stored in a local PouchDB database on the device and synced peer-to-peer with the user's other devices or trusted peers.

### Platform Targets

| Platform | Runtime |
|----------|---------|
| Web | React + Node |
| Mobile | React + Capacitor |
| Desktop | React + Electron |

The React frontend is shared across all three targets. Platform-specific code is isolated to the Capacitor and Electron layers.

### Data Layer

- Each device runs a local **PouchDB** instance as its source of truth.
- Devices sync with each other directly using PouchDB's built-in replication protocol.
- No central database or sync server is required.

---

## Tech Stack

| Concern | Technology |
|---------|-----------|
| Frontend | React |
| Runtime (web) | Node |
| Mobile wrapper | Capacitor |
| Desktop wrapper | Electron |
| Local database | PouchDB |
| P2P sync | PouchDB replication |

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
