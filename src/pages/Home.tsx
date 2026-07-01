import { useState, useRef } from 'react'
import { pluginManager } from '../plugins/manager'
import type { VideoInfo } from '../plugins/types'
import { parseVideoId } from '../utils/youtube'
import VideoPlayer from '../components/VideoPlayer'
import './Home.css'

type State =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; info: VideoInfo }

export default function Home() {
  const [url, setUrl] = useState('')
  const [state, setState] = useState<State>({ status: 'idle' })
  const inputRef = useRef<HTMLInputElement>(null)

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    load(url)
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData('text')
    // If the pasted text itself is a valid YouTube URL, load immediately
    if (parseVideoId(pasted)) {
      e.preventDefault()
      setUrl(pasted)
      load(pasted)
    }
  }

  function load(input: string) {
    const videoId = parseVideoId(input)
    if (!videoId) {
      setState({ status: 'error', message: 'Not a recognised YouTube URL.' })
      return
    }

    let plugin
    try {
      plugin = pluginManager.getActive()
    } catch {
      setState({ status: 'error', message: 'No video plugin available. Run the app via Electron for yt-dlp support, or configure an Invidious instance in Settings.' })
      return
    }

    setState({ status: 'loading' })
    plugin
      .getVideoInfo(videoId)
      .then(info => setState({ status: 'ready', info }))
      .catch((err: Error) => setState({ status: 'error', message: err.message }))
  }

  return (
    <div className="home">
      <form className="url-bar" onSubmit={handleSubmit}>
        <input
          ref={inputRef}
          className="url-input"
          type="text"
          placeholder="Paste a YouTube URL…"
          value={url}
          onChange={e => setUrl(e.target.value)}
          onPaste={handlePaste}
          autoFocus
        />
        <button className="url-submit" type="submit">Play</button>
      </form>

      {state.status === 'loading' && (
        <p className="home-status">Loading…</p>
      )}

      {state.status === 'error' && (
        <p className="home-status home-error">{state.message}</p>
      )}

      {state.status === 'ready' && (
        <div className="home-player">
          <VideoPlayer streams={state.info.streams} title={state.info.title} />
          <div className="home-meta">
            <h2 className="home-title">{state.info.title}</h2>
            <p className="home-channel">{state.info.channelName}</p>
          </div>
        </div>
      )}
    </div>
  )
}
