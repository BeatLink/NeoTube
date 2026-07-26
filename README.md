# NeoTube

A free, open source, privacy-respecting YouTube client.

NeoTube lets you browse and watch YouTube content without being tracked by Google. It is fully peer-to-peer — your data lives on your device and syncs directly with your other devices, with no central server involved.

## Platforms

| Platform | How |
|----------|-----|
| Desktop | Tauri (Linux / macOS / Windows) |
| Web | Vite dev server / static build |
| Mobile | Tauri v2 (Android / iOS) — planned |

## Development

NeoTube uses a [Nix](https://nixos.org/) dev environment for reproducible builds.

### Enter the dev shell

```bash
nix develop        # flake-based (recommended)
# or
nix-shell          # legacy nix-shell
```

### Install dependencies

```bash
npm install
```

### Run the web app

```bash
npm run dev
```

### Run the desktop app (Tauri)

```bash
npm run tauri:dev
```

Requires the Nix dev shell, which provides the Rust toolchain, `tauri-cli`, and the
WebKitGTK system libraries.

### Run tests

```bash
npm test           # watch mode
npm run test:run   # single pass
```

### Build

```bash
npm run build              # web (outputs to dist/)
npm run tauri:build        # desktop installers (outputs to src-tauri/target/release/)
```

## Project structure

See [DEVELOP.md](DEVELOP.md) for the full architecture, tech stack, and roadmap.

## License

GPL-3.0-only — see [LICENSE](LICENSE).
