import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { ThemeProvider, useTheme } from '../src/contexts/ThemeContext'

vi.mock('../src/db/index', () => ({
  getSettings: vi.fn().mockResolvedValue({ _id: 'settings', type: 'settings', theme: 'system', activePlugin: 'youtubejs', defaultQuality: 'best', privacyMode: true }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}))

import { getSettings, saveSettings } from '../src/db/index'

function mockMatchMedia(matches: boolean) {
  vi.mocked(window.matchMedia).mockImplementation((query: string) => ({
    matches,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }))
}

beforeEach(() => {
  localStorage.clear()
  document.documentElement.removeAttribute('data-theme')
  mockMatchMedia(false)
  vi.mocked(getSettings).mockResolvedValue({ _id: 'settings', type: 'settings', theme: 'system', activePlugin: 'youtubejs', defaultQuality: 'best', privacyMode: true })
  vi.mocked(saveSettings).mockResolvedValue(undefined)
})

const wrapper = ({ children }: { children: React.ReactNode }) =>
  ThemeProvider({ children })

describe('ThemeContext / useTheme', () => {
  it('defaults to light when system is light and no stored value', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('light')
  })

  it('defaults to dark when system prefers dark', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')
  })

  it('restores stored theme from localStorage', () => {
    localStorage.setItem('neotube-theme', 'dark')
    const { result } = renderHook(() => useTheme(), { wrapper })
    expect(result.current.theme).toBe('dark')
  })

  it('hydrates from PouchDB when db has a non-system theme', async () => {
    vi.mocked(getSettings).mockResolvedValue({ _id: 'settings', type: 'settings', theme: 'dark', activePlugin: 'youtubejs', defaultQuality: 'best', privacyMode: true })
    const { result } = renderHook(() => useTheme(), { wrapper })
    await waitFor(() => expect(result.current.theme).toBe('dark'))
  })

  it('toggle switches between light and dark', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('dark')
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('light')
  })

  it('setTheme sets a specific value', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme('dark'))
    expect(result.current.theme).toBe('dark')
  })

  it('persists to localStorage on change', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.toggle())
    expect(localStorage.getItem('neotube-theme')).toBe('dark')
  })

  it('sets data-theme attribute on documentElement', () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.toggle())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('calls saveSettings with new theme', async () => {
    const { result } = renderHook(() => useTheme(), { wrapper })
    act(() => result.current.setTheme('dark'))
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ theme: 'dark' }))
  })
})
