# NeoTube — Claude Code guidance

## Repo layout

```
NeoTube/
├── server/          Node.js REST API server (Fastify + PouchDB + youtubei.js + yt-dlp)
├── app/             Flutter native UI (iOS, Android, Linux, macOS, Windows)
├── electron/        Desktop stop-gap wrapper (main.ts + preload.ts)
├── src/             React UI used by the Electron stop-gap
└── shell.nix        Nix dev shell (nodejs_22, electron, flutter, jdk17, yt-dlp)
```

Full architecture and roadmap are in [DEVELOP.md](DEVELOP.md).

## Dev environment

All development happens inside the Nix shell. Enter it once at the start of a session:

```bash
nix-shell   # provides node, npm, flutter, jdk17, yt-dlp, electron, git
```

- **Install libraries here** — never `npm install` or `flutter pub add` outside the shell
- **Run all build, test, and run commands from inside the shell**
- To add a new tool to the environment, add it to `shell.nix` and re-enter the shell

## Running things

```bash
# API server (port 7700)
cd server && npm run dev

# Flutter app (pick a device with `flutter devices`)
cd app && flutter run

# Electron stop-gap
npm run dev:electron          # root — builds electron/main.ts then starts Vite + Electron
```

## Server (`server/`)

- **Framework**: Fastify 5, ESM, TypeScript via `tsx`
- **DB**: PouchDB 9 on LevelDB (`~/.neotube/db` or `$NEOTUBE_DB_PATH`)
- **YouTube**: youtubei.js Innertube singleton in `server/src/innertube.ts` — no CORS workarounds needed
- **yt-dlp**: spawned from `server/src/ytdlp.ts`; path via `$YTDLP_PATH`
- **Port**: 7700 (override via `$NEOTUBE_PORT`)
- **Auth**: optional `X-Api-Key` header via `$NEOTUBE_API_KEY`
- All routes are under `/api/` — see `server/src/routes/`

Adding a route: create `server/src/routes/<name>.ts` exporting a default Fastify plugin, then register it in `server/src/index.ts`.

## Flutter app (`app/`)

- **State**: flutter_riverpod — all async data goes through providers in `lib/providers/providers.dart`
- **Nav**: go_router — routes defined in `lib/router.dart`; the bottom-nav shell wraps the 5 tab routes; `/watch/:id` and `/channel/:id` are full-screen overlays
- **API client**: `lib/api/client.dart` — `NeoTubeClient` wraps every server endpoint; always go through this, never call `http` directly from screens
- **Models**: `lib/models/models.dart` — mirrors `server/src/types.ts`; keep them in sync
- **Server URL**: stored in `SharedPreferences`, managed by `ServerUrlNotifier`; users set it in the Settings screen

Adding a screen: create `lib/screens/<name>/<name>_screen.dart`, add a route in `router.dart`, and if it needs remote data add a `FutureProvider` in `providers.dart` or co-locate it in the screen file.

## Electron stop-gap (`electron/` + `src/`)

- `electron/main.ts` — adds `session.webRequest` CORS headers so the React renderer can call `http://localhost:7700`; also bridges yt-dlp and FreeTube import via IPC
- `electron/preload.ts` — exposes `window.ytdlp` and `window.electron` via `contextBridge`
- `src/plugins/youtubejs/innertube.ts` — Innertube singleton used by the React plugin (separate from the server's copy)
- `src/plugins/` — plugin system (`PluginManager`, `VideoPlugin` interface); new plugins go here

## Commands

| Task | Command |
|------|---------|
| Lint (React) | `npm run lint` |
| Tests (React) | `npm test` |
| Build Electron | `npm run build:electron` |
| Server dev | `cd server && npm run dev` |
| Flutter analyze | `cd app && flutter analyze` |
| Flutter test | `cd app && flutter test` |

## Conventions

- TypeScript strict mode everywhere; no `any` unless unavoidable and documented
- No barrel `index.ts` re-exports in `server/` — import from the exact file
- Dart: use `const` constructors wherever possible; no `print()` in production code (use `debugPrint`)
- Server route files export a single default Fastify plugin function
- Flutter screens end in `Screen`, widgets don't
- PouchDB document IDs use a typed prefix: `sub-<channelId>`, `history-<videoId>`, `settings`, `channel-cache-<channelId>`

## Documentation

Keep documentation in sync with every code change:

- **`CLAUDE.md`** — update whenever commands, conventions, or project structure change
- **`DEVELOP.md`** — update the relevant section (Architecture, Features, Directory Structure, Roadmap) when adding or removing a significant capability; tick roadmap checkboxes as items complete
- **`server/src/types.ts` ↔ `app/lib/models/models.dart`** — these must stay in sync; update both when the API contract changes

Do not create separate design or decision documents — use the conversation and `DEVELOP.md` instead.

## Tests

Run the relevant suite before committing:

```bash
# React / Electron (Vitest)
npm run test:run

# Flutter
cd app && flutter test

# Server (no test suite yet — start the server and hit /api/health as a smoke test)
cd server && npm run dev &
curl -s http://localhost:7700/api/health
```

All tests must pass before committing. If a test suite doesn't exist for the changed area, note it explicitly rather than skipping silently.

## Committing

1. **Run tests** for the changed area (see above).
2. **Update docs** — tick roadmap items, update DEVELOP.md sections, update CLAUDE.md if conventions changed.
3. **Stage precisely** — add specific files, not `git add .`; never stage `.env`, secrets, or build artefacts.
4. **Commit message format**:
   - First line: `<Type>: <short imperative summary>` (≤ 72 chars)
   - Types: `Add`, `Fix`, `Refactor`, `Update`, `Remove`, `Docs`
   - Body (optional): explain *why*, not *what*; reference the area (`server/`, `app/`, `electron/`)
   - Always add the co-author trailer: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
5. **One logical change per commit** — don't bundle unrelated fixes.

## Response style

- Be concise. One sentence per update while working; one or two sentences at the end summarising what changed and what's next.
- No preamble ("Sure!", "Great question!", "I'll now…"). Start with the action.
- No trailing summaries restating what the diff already shows.
- Prefer a direct answer over a list of options when the right answer is clear.
- Skip comments that explain *what* code does — only add them when the *why* is non-obvious.
