import { describe, it, expect, beforeEach, vi } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useTheme } from '../hooks/useTheme'

vi.mock('../db/index', () => ({
  getSettings: vi.fn().mockResolvedValue({ theme: 'light' }),
  saveSettings: vi.fn().mockResolvedValue(undefined),
}))

import { getSettings, saveSettings } from '../db/index'

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
  vi.mocked(getSettings).mockResolvedValue({ _id: 'settings', type: 'settings', theme: 'system', defaultQuality: 'best', privacyMode: true })
  vi.mocked(saveSettings).mockResolvedValue(undefined)
})

describe('useTheme', () => {
  it('defaults to light when no localStorage value and system is light', () => {
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('light')
  })

  it('defaults to dark when system prefers dark and no stored value', () => {
    mockMatchMedia(true)
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('restores stored theme from localStorage', () => {
    localStorage.setItem('neotube-theme', 'dark')
    const { result } = renderHook(() => useTheme())
    expect(result.current.theme).toBe('dark')
  })

  it('hydrates from PouchDB on mount when db has a non-system theme', async () => {
    vi.mocked(getSettings).mockResolvedValue({ _id: 'settings', type: 'settings', theme: 'dark', defaultQuality: 'best', privacyMode: true })
    const { result } = renderHook(() => useTheme())
    await waitFor(() => expect(result.current.theme).toBe('dark'))
  })

  it('toggle switches between light and dark', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('dark')
    act(() => result.current.toggle())
    expect(result.current.theme).toBe('light')
  })

  it('persists theme to localStorage on change', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggle())
    expect(localStorage.getItem('neotube-theme')).toBe('dark')
  })

  it('sets data-theme attribute on documentElement', () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggle())
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark')
  })

  it('calls saveSettings with new theme on toggle', async () => {
    const { result } = renderHook(() => useTheme())
    act(() => result.current.toggle())
    await waitFor(() => expect(saveSettings).toHaveBeenCalledWith({ theme: 'dark' }))
  })
})
