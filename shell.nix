{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = with pkgs; [
    # ── Core ──────────────────────────────────────────────────────────────────
    nodejs_22        # Frontend (Vite/React) + Server (Fastify)

    # ── Desktop client ────────────────────────────────────────────────────────
    electron         # Electron shell (stop-gap while Flutter desktop matures)

    # ── Mobile / cross-platform UI ────────────────────────────────────────────
    flutter          # Flutter SDK — iOS, Android, Linux, macOS, Windows
    jdk17            # Required by Flutter Android toolchain

    # Android SDK — uncomment and adjust paths when targeting Android
    # androidenv.androidPkgs.platform-tools
    # androidenv.androidPkgs.build-tools
    # android-studio

    # ── Video backend ─────────────────────────────────────────────────────────
    yt-dlp           # Used by the server's ytdlp backend

    # ── Tooling ───────────────────────────────────────────────────────────────
    git
  ];

  shellHook = ''
    echo "NeoTube dev environment"
    echo "  node    $(node --version)"
    echo "  npm     $(npm --version)"
    echo "  flutter $(flutter --version 2>/dev/null | head -1 || echo 'not found')"
    echo ""
    echo "  Server:   cd server && npm run dev   (port 7700)"
    echo "  Frontend: npm run dev:electron"
    echo "  Flutter:  cd app && flutter run"

    # On NixOS the npm-downloaded Electron binary won't run (generic ELF).
    # Point the electron npm package at the nixpkgs-patched binary instead.
    export ELECTRON_OVERRIDE_DIST_PATH="$(dirname "$(command -v electron)")"

    # Tell Flutter to use the system JDK for Android builds.
    export JAVA_HOME="${pkgs.jdk17}"

    # Silence Flutter's "run flutter doctor" nudge in CI-like environments.
    export FLUTTER_SUPPRESS_ANALYTICS=true

    # Tell the Flutter Linux app where to find the server so it can start it
    # automatically as a child process on launch.
    export NEOTUBE_SERVER_PATH="$(pwd)/server"
  '';
}
