# NeoTube

A free, open source, privacy-respecting YouTube client.

NeoTube lets you browse and watch YouTube content without being tracked by Google. It is fully peer-to-peer — your data lives on your device and syncs directly with your other devices, with no central server involved.

## Platforms

| Platform | How |
|----------|-----|
| Web | Vite dev server / static build |
| Desktop | Electron |
| Mobile | Capacitor (Android / iOS) |

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

### Run the desktop app (Electron)

```bash
npm run dev:electron
```

Requires the Nix dev shell (provides `electron` and `yt-dlp` binaries).

### Run tests

```bash
npm test           # watch mode
npm run test:run   # single pass
```

### Build

```bash
npm run build              # web (outputs to dist/)
npm run build:electron     # desktop (outputs to release/)
```

## Project structure

See [DEVELOP.md](DEVELOP.md) for the full architecture, tech stack, and roadmap.

## License

GPL-3.0-only — see [LICENSE](LICENSE).
