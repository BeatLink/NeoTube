import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import VideoControls, { formatTime } from '../src/components/VideoControls/VideoControls'
import type { PlaybackState } from '../src/hooks/useVideoPlayback'

const state = (overrides: Partial<PlaybackState> = {}): PlaybackState => ({
  playing: false,
  currentTime: 30,
  duration: 300,
  buffered: 120,
  volume: 1,
  muted: false,
  rate: 1,
  stalled: false,
  ...overrides,
})

function renderControls(overrides: Partial<Parameters<typeof VideoControls>[0]> = {}) {
  const props = {
    state: state(),
    qualities: [{ id: 'auto', label: 'Auto' }, { id: 'v1', label: '1080p' }],
    selectedQuality: 'auto',
    fullscreen: false,
    onTogglePlay: vi.fn(),
    onSeek: vi.fn(),
    onSetVolume: vi.fn(),
    onToggleMute: vi.fn(),
    onSetRate: vi.fn(),
    onSelectQuality: vi.fn(),
    onToggleFullscreen: vi.fn(),
    ...overrides,
  }
  render(<VideoControls {...props} />)
  return props
}

describe('formatTime', () => {
  it('formats under an hour as m:ss', () => {
    expect(formatTime(0)).toBe('0:00')
    expect(formatTime(9)).toBe('0:09')
    expect(formatTime(75)).toBe('1:15')
    expect(formatTime(599)).toBe('9:59')
  })

  it('formats an hour or more as h:mm:ss', () => {
    expect(formatTime(3600)).toBe('1:00:00')
    expect(formatTime(3725)).toBe('1:02:05')
  })

  // Live streams report Infinity for duration.
  it('falls back to 0:00 for values it cannot format', () => {
    expect(formatTime(NaN)).toBe('0:00')
    expect(formatTime(Infinity)).toBe('0:00')
    expect(formatTime(-5)).toBe('0:00')
  })
})

describe('VideoControls', () => {
  beforeEach(() => vi.clearAllMocks())

  it('shows a play button while paused', () => {
    renderControls()
    expect(screen.getByLabelText('Play')).toBeInTheDocument()
  })

  it('shows a pause button while playing', () => {
    renderControls({ state: state({ playing: true }) })
    expect(screen.getByLabelText('Pause')).toBeInTheDocument()
  })

  it('reports play toggles', async () => {
    const props = renderControls()
    await userEvent.click(screen.getByLabelText('Play'))
    expect(props.onTogglePlay).toHaveBeenCalledOnce()
  })

  it('renders elapsed and total time', () => {
    renderControls()
    expect(screen.getByText('0:30 / 5:00')).toBeInTheDocument()
  })

  it('reports mute toggles', async () => {
    const props = renderControls()
    await userEvent.click(screen.getByLabelText('Mute'))
    expect(props.onToggleMute).toHaveBeenCalledOnce()
  })

  it('shows the muted icon and a zeroed slider when muted', () => {
    renderControls({ state: state({ muted: true }) })
    expect(screen.getByLabelText('Unmute')).toBeInTheDocument()
    expect(screen.getByLabelText('Volume')).toHaveValue('0')
  })

  it('opens the speed menu and applies a choice', async () => {
    const props = renderControls()
    await userEvent.click(screen.getByLabelText('Playback speed'))
    await userEvent.click(screen.getByText('1.5×'))
    expect(props.onSetRate).toHaveBeenCalledWith(1.5)
  })

  it('labels the speed button with the current rate', () => {
    renderControls({ state: state({ rate: 2 }) })
    expect(screen.getByLabelText('Playback speed')).toHaveTextContent('2×')
  })

  it('opens the quality menu and applies a choice', async () => {
    const props = renderControls()
    await userEvent.click(screen.getByLabelText('Quality'))
    await userEvent.click(screen.getByText('1080p'))
    expect(props.onSelectQuality).toHaveBeenCalledWith('v1')
  })

  it('omits the quality control when there are no options', () => {
    renderControls({ qualities: [] })
    expect(screen.queryByLabelText('Quality')).not.toBeInTheDocument()
  })

  it('reports fullscreen toggles', async () => {
    const props = renderControls()
    await userEvent.click(screen.getByLabelText('Enter fullscreen'))
    expect(props.onToggleFullscreen).toHaveBeenCalledOnce()
  })

  it('offers an exit action while fullscreen', () => {
    renderControls({ fullscreen: true })
    expect(screen.getByLabelText('Exit fullscreen')).toBeInTheDocument()
  })

  it('exposes progress and buffered amount to the seek bar', () => {
    renderControls()
    const seek = screen.getByLabelText('Seek')
    // 30/300 played, 120/300 buffered.
    expect(seek.style.getPropertyValue('--vc-progress')).toBe('10%')
    expect(seek.style.getPropertyValue('--vc-buffered')).toBe('40%')
  })

  // A zero duration would otherwise divide by zero and render NaN%.
  it('handles a video with no known duration', () => {
    renderControls({ state: state({ duration: 0, currentTime: 0, buffered: 0 }) })
    expect(screen.getByLabelText('Seek').style.getPropertyValue('--vc-progress')).toBe('0%')
  })
})
