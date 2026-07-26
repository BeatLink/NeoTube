/* eslint-disable @typescript-eslint/no-explicit-any */
import { useEffect, useRef, useState } from 'react'
import './SabrPlayer.css'

interface SabrPlayerProps {
  videoId: string
  title: string
  /** Reports a getter for the playhead, for timed share links. */
  onReady?: (getCurrentTime: () => number) => void
}

/**
 * Plays a video over SABR — YouTube's current streaming protocol — using
 * shaka-player and googlevideo's streaming adapter.
 *
 * This replaces the dash.js path, which could not drive YouTube's DASH
 * manifests: it ignored the declared `SegmentBase` ranges, probed for the init
 * box, and then requested byte offsets past the end of the stream. SABR is what
 * youtubei.js's maintainer recommends and what YouTube itself serves.
 *
 * Everything is loaded lazily: shaka, googlevideo and BotGuard together are
 * large, and only the watch page needs them.
 */
export default function SabrPlayer({ videoId, title, onReady }: SabrPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const cleanupRef = useRef<(() => void) | null>(null)
  const [phase, setPhase] = useState<string | null>('Loading…')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    onReady?.(() => videoRef.current?.currentTime ?? 0)
  }, [onReady])

  useEffect(() => {
    if (!videoId) return

    let cancelled = false
    setPhase('Loading…')
    setError(null)

    ;(async () => {
      try {
        const [{ default: shaka }, { SabrStreamingAdapter }, { buildSabrFormat },
          { ShakaPlayerAdapter }, { botguardService }, innertubeModule] = await Promise.all([
          import('shaka-player/dist/shaka-player.ui'),
          import('googlevideo/sabr-streaming-adapter'),
          import('googlevideo/utils'),
          import('../../services/shakaAdapter'),
          import('../../services/botguard'),
          import('../../plugins/youtubejs/innertube'),
        ])
        if (cancelled) return

        shaka.polyfill.installAll()
        if (!shaka.Player.isBrowserSupported()) {
          throw new Error('This webview cannot play video with shaka-player.')
        }

        setPhase('Reading streams…')
        const { info, streamingUrl, ustreamerConfig, formats, cpn } =
          await innertubeModule.getSabrStreamingData(videoId)
        if (cancelled) return

        const player = new shaka.Player()
        player.configure({
          abr: { enabled: true },
          streaming: { bufferingGoal: 120, rebufferingGoal: 2 },
        })
        await player.attach(videoRef.current!)

        const ui = new shaka.ui.Overlay(player, containerRef.current!, videoRef.current!)
        ui.configure({
          addBigPlayButton: true,
          overflowMenuButtons: ['quality', 'playback_rate', 'captions', 'picture_in_picture', 'loop'],
        })

        const adapter = new SabrStreamingAdapter({
          playerAdapter: new ShakaPlayerAdapter(),
          clientInfo: await innertubeModule.getSabrClientInfo(),
        })

        // BotGuard runs in the background; until it is ready a weaker
        // cold-start token keeps the first segments flowing.
        void botguardService.init().catch(() => {})
        let poToken: string | undefined
        adapter.onMintPoToken(async () => {
          if (!poToken) {
            poToken = await botguardService.mint(videoId).catch(() => undefined)
          }
          return poToken ?? botguardService.mintColdStartToken(videoId)
        })

        adapter.onReloadPlayerResponse(async reloadContext => {
          const reloaded = await innertubeModule.getSabrStreamingData(videoId, reloadContext)
          adapter.setStreamingURL(reloaded.streamingUrl)
          adapter.setUstreamerConfig(reloaded.ustreamerConfig)
        })

        adapter.attach(player)
        adapter.setStreamingURL(streamingUrl)
        adapter.setUstreamerConfig(ustreamerConfig)
        adapter.setServerAbrFormats(formats.map(buildSabrFormat))

        setPhase('Buffering…')
        const manifest = await info.toDash({
          manifest_options: { is_sabr: true, captions_format: 'vtt', include_thumbnails: false },
        })
        if (cancelled) return

        await player.load(`data:application/dash+xml;base64,${btoa(unescape(encodeURIComponent(manifest)))}`)
        if (cancelled) return
        setPhase(null)

        cleanupRef.current = () => {
          adapter.dispose()
          void ui.destroy()
          void player.destroy()
        }
        void cpn
      } catch (e) {
        if (!cancelled) {
          setPhase(null)
          setError(e instanceof Error ? e.message : 'Playback failed.')
        }
      }
    })()

    return () => {
      cancelled = true
      cleanupRef.current?.()
      cleanupRef.current = null
    }
  }, [videoId])

  return (
    <div className="sabr-player" ref={containerRef} data-shaka-player-container>
      <video
        ref={videoRef}
        className="sabr-video"
        data-shaka-player
        autoPlay
        title={title}
      />
      {phase && (
        <div className="sabr-loading" role="status">
          <div className="sabr-spinner" />
          <p className="sabr-loading-text">{phase}</p>
        </div>
      )}
      {error && <p className="sabr-error">{error}</p>}
    </div>
  )
}
