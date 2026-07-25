{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = with pkgs; [
    # ── Core ──────────────────────────────────────────────────────────────────
    nodejs_22        # Frontend (Vite/React) + Server (Fastify)

    # ── Desktop client ────────────────────────────────────────────────────────
    electron         # Electron shell wrapping the React UI (src/)

    # ── Video backend ─────────────────────────────────────────────────────────
    yt-dlp           # Used by the server's ytdlp backend

    # ── Tooling ───────────────────────────────────────────────────────────────
    git
  ];

  shellHook = ''
    echo "NeoTube dev environment"
    echo "  node    $(node --version)"
    echo "  npm     $(npm --version)"
    echo ""
    echo "  Server:   cd server && npm run dev   (port 7700)"
    echo "  Frontend: npm run dev:electron"

    # On NixOS the npm-downloaded Electron binary won't run (generic ELF).
    # Point the electron npm package at the nixpkgs-patched binary instead.
    export ELECTRON_OVERRIDE_DIST_PATH="$(dirname "$(command -v electron)")"

    # Tell the app where to find the server directory.
    export NEOTUBE_SERVER_PATH="$(pwd)/server"
  '';
}
