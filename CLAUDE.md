# NeoTube — Claude Code guidance

## Repo layout

```
NeoTube/
├── src/             React UI — the app itself (runs in the Tauri webview and the browser)
├── src-tauri/       Tauri desktop shell (Rust): window, HTTP stack, native commands
├── server/          Optional Node.js REST API (Fastify + PouchDB + youtubei.js + yt-dlp)
└── shell.nix        Nix dev shell (nodejs_22, rust, tauri-cli, webkitgtk, yt-dlp, git)
```

Full architecture and roadmap are in [DEVELOP.md](DEVELOP.md).

## Dev environment

All development happens inside the Nix shell. Enter it once at the start of a session:

```bash
nix-shell   # provides node, npm, cargo/rustc, tauri-cli, webkitgtk, yt-dlp, git
            # also sets NEOTUBE_SERVER_PATH=$(pwd)/server
```

- **Install libraries here** — never `npm install` outside the shell
- **Run all build, test, and run commands from inside the shell**
- To add a new tool to the environment, add it to `shell.nix` and re-enter the shell

## Running things

```bash
# Tauri desktop app — this is the whole app; no server required
npm run tauri:dev

# Optional API server (port 7700) — only the browser build needs it
cd server && npm run dev

# React web UI in the browser (points at the API server above)
npm run dev
```

Vite is pinned to port 5173 (`strictPort`) because `src-tauri/tauri.conf.json` points at
that URL. If it's taken, `tauri:dev` fails loudly instead of showing a blank window.

## Server (`server/`)

- **Framework**: Fastify 5, ESM, TypeScript via `tsx`
- **DB**: PouchDB 9 on LevelDB (`~/.neotube/db` or `$NEOTUBE_DB_PATH`)
- **YouTube**: youtubei.js Innertube singleton in `server/src/innertube.ts` — no CORS workarounds needed
- **yt-dlp**: spawned from `server/src/ytdlp.ts`; path via `$YTDLP_PATH`
- **Port**: 7700 (override via `$NEOTUBE_PORT`)
- **Auth**: optional `X-Api-Key` header via `$NEOTUBE_API_KEY`
- All routes are under `/api/` — see `server/src/routes/`

Adding a route: create `server/src/routes/<name>.ts` exporting a default Fastify plugin, then register it in `server/src/index.ts`.

## React UI (`src/`) + Tauri (`src-tauri/`)

- `src/` is the app; it runs in the Tauri webview and in a plain browser
- **Routing**: React Router 7 — routes in `src/App.tsx`; `Layout` wraps the tab pages, `/watch/:videoId` and `/channel/:channelId` render inside it
- **Pages**: `src/pages/<Name>/` (Home, Search, Watch, Channel, Subscriptions, Channels, History, Settings)
- **Data layer**: PouchDB (browser) via `src/db/`; the plugin system (`src/plugins/`, youtubejs only) fetches YouTube data
- **Desktop-only features** (e.g. FreeTube import) are Rust commands in `src-tauri/src/`, wrapped in `src/utils/tauri.ts` and guarded with `isTauri()` in the page

### The fetch shim — read before touching networking

youtubei.js runs *in the webview*, so YouTube requests would normally hit CORS. They are
routed through Rust's HTTP stack instead via `Innertube.create({ fetch })`. Two
non-obvious rules, both enforced by `tests/tauriFetch.test.ts`:

- **Pin `Origin`/`Referer` to `https://www.youtube.com`.** InnerTube returns `403` for any
  cross-origin value, including an empty one.
- **Set them, never delete them.** `@tauri-apps/plugin-http` builds its own `Request` and
  merges the webview's headers back in for any key the caller left unset, so a deleted
  `Origin` silently reappears as `http://localhost:5173`.

Adding a native command: write it in `src-tauri/src/`, register it in the
`invoke_handler!` list in `src-tauri/src/lib.rs`, then wrap it in `src/utils/tauri.ts`.
New outbound hosts must be allow-listed in `src-tauri/capabilities/default.json`.

Adding a page: create `src/pages/<Name>/<Name>.tsx` (+ `.css`, `index.ts`), then add a `<Route>` in `src/App.tsx`.

## Commands

| Task | Command |
|------|---------|
| Lint (React) | `npm run lint` |
| Tests (React) | `npm run test:run` |
| Server dev | `cd server && npm run dev` |
| Web dev | `npm run dev` |
| Desktop dev | `npm run tauri:dev` |
| Desktop build | `npm run tauri:build` |
| Rust tests | `cd src-tauri && cargo test` |

## Conventions

- TypeScript strict mode everywhere; no `any` unless unavoidable and documented
- No barrel `index.ts` re-exports in `server/` — import from the exact file
- React: pages live in `src/pages/<Name>/`, shared UI in `src/components/<Name>/`; each folder has an `index.ts` re-export
- Server route files export a single default Fastify plugin function
- PouchDB document IDs use a typed prefix: `sub-<channelId>`, `history-<videoId>`, `settings`, `channel-cache-<channelId>`

## Documentation

Keep documentation in sync with every code change:

- **`CLAUDE.md`** — update whenever commands, conventions, or project structure change
- **`DEVELOP.md`** — update the relevant section when adding or removing a significant capability; tick roadmap checkboxes as items complete
- **`server/src/types.ts` ↔ `src/types/index.ts`** — keep the shared API/data types in sync when the contract changes

Do not create separate design or decision documents — use the conversation and `DEVELOP.md` instead.

## Tests

Run the relevant suite before committing:

```bash
# React (Vitest)
npm run test:run

# Rust (Tauri shell)
cd src-tauri && cargo test

# Server smoke test (no test suite yet)
cd server && npm run dev &
curl -s http://localhost:7700/api/health
```

All tests must pass before committing. If a test suite doesn't exist for the changed area, note it explicitly.

## Committing

1. **Run tests** for the changed area (see above).
2. **Update docs** — tick roadmap items, update DEVELOP.md, update CLAUDE.md if conventions changed.
3. **Stage precisely** — add specific files, not `git add .`; never stage `.env`, secrets, or build artefacts.
4. **Commit message format**:
   - First line: `<Type>: <short imperative summary>` (≤ 72 chars)
   - Types: `Add`, `Fix`, `Refactor`, `Update`, `Remove`, `Docs`
   - Body (optional): explain *why*, not *what*; reference the area (`server/`, `src-tauri/`, `src/`)
   - Always add the co-author trailer: `Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>`
5. **One logical change per commit** — don't bundle unrelated fixes.

## Response style

- Be concise. One sentence per update while working; one or two sentences at the end summarising what changed and what's next.
- No preamble ("Sure!", "Great question!", "I'll now…"). Start with the action.
- No trailing summaries restating what the diff already shows.
- Prefer a direct answer over a list of options when the right answer is clear.
- Skip comments that explain *what* code does — only add them when the *why* is non-obvious.
