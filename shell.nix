{ pkgs ? import <nixpkgs> { } }:

pkgs.mkShell {
  packages = with pkgs; [
    # ── Core ──────────────────────────────────────────────────────────────────
    nodejs_22        # Frontend (Vite/React) + Server (Fastify)

    # ── Desktop client (Tauri) ────────────────────────────────────────────────
    cargo            # Rust toolchain — builds the Tauri shell (src-tauri/)
    rustc
    rustfmt
    clippy
    rust-analyzer
    cargo-tauri      # `cargo tauri dev` / `cargo tauri build`
    pkg-config       # Locates the C libraries below during the Rust build

    # ── Tauri system libraries ────────────────────────────────────────────────
    # Tauri renders in the platform webview; on Linux that is WebKitGTK.
    webkitgtk_4_1    # The webview itself (Tauri v2 requires the 4.1 ABI)
    gtk3
    libsoup_3        # HTTP stack WebKitGTK links against
    glib-networking  # TLS backend — without it HTTPS fails inside the webview
    openssl          # Needed by the Rust HTTP stack (tauri-plugin-http)
    librsvg          # Renders the SVG app icon

    # ── Media playback ────────────────────────────────────────────────────────
    # WebKitGTK plays <video> through GStreamer. Without these the webview logs
    # "GStreamer element appsink not found" and playback silently fails.
    gst_all_1.gstreamer
    gst_all_1.gst-plugins-base   # appsink/appsrc — the elements WebKit looks for
    gst_all_1.gst-plugins-good   # matroska/webm, vpx
    gst_all_1.gst-plugins-bad    # extra demuxers/decoders
    gst_all_1.gst-libav          # H.264/AAC — what YouTube usually serves

    # ── Video backend ─────────────────────────────────────────────────────────
    # Still used by the *server* (server/src/ytdlp.ts). The Tauri client itself
    # uses youtubei.js only.
    yt-dlp

    # ── Tooling ───────────────────────────────────────────────────────────────
    git
  ];

  shellHook = ''
    echo "NeoTube dev environment"
    echo "  node    $(node --version)"
    echo "  npm     $(npm --version)"
    echo "  cargo   $(cargo --version 2>/dev/null || echo 'not found')"
    echo ""
    echo "  Server:   cd server && npm run dev   (port 7700)"
    echo "  Desktop:  npm run tauri:dev"

    # Tell the app where to find the server directory.
    export NEOTUBE_SERVER_PATH="$(pwd)/server"

    # glib-networking ships its TLS module outside the webkit closure; without
    # this WebKitGTK cannot negotiate HTTPS and every YouTube request fails.
    export GIO_MODULE_DIR="${pkgs.glib-networking}/lib/gio/modules"

    # NixOS ships no system-wide OpenGL driver path; Tauri's webview needs a
    # software fallback when the host GL driver isn't visible to the sandbox.
    export WEBKIT_DISABLE_COMPOSITING_MODE=1
    export WEBKIT_DISABLE_DMABUF_RENDERER=1

    # WebKitGTK finds its media elements through this path.
    export GST_PLUGIN_SYSTEM_PATH_1_0="${pkgs.lib.makeSearchPathOutput "lib" "lib/gstreamer-1.0" (with pkgs.gst_all_1; [
      gstreamer gst-plugins-base gst-plugins-good gst-plugins-bad gst-libav
    ])}"
  '';
}
