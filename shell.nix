{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = with pkgs; [
    # Core
    nodejs_22
    # npm is bundled with nodejs_22

    # Desktop
    electron

    # Mobile (Capacitor — uncomment when targeting Android/iOS)
    # androidenv.androidPkgs.platform-tools
    # jdk17

    # Video backend
    yt-dlp

    # Tooling
    git
  ];

  shellHook = ''
    echo "NeoTube dev environment"
    echo "  node $(node --version)"
    echo "  npm  $(npm --version)"

    # On NixOS the npm-downloaded Electron binary won't run (generic ELF).
    # Point the electron npm package at the nixpkgs-patched binary instead.
    export ELECTRON_OVERRIDE_DIST_PATH="$(dirname "$(command -v electron)")"
  '';
}
