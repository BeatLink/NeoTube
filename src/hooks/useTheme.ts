import { useEffect, useState } from 'react'
import { getSettings, saveSettings } from '../db/index'

type Theme = 'light' | 'dark'

const STORAGE_KEY = 'neotube-theme'

function getInitialTheme(): Theme {
  const stored = localStorage.getItem(STORAGE_KEY)
  if (stored === 'light' || stored === 'dark') return stored
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function useTheme() {
  const [theme, setTheme] = useState<Theme>(getInitialTheme)

  // Apply to DOM and cache locally on every change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem(STORAGE_KEY, theme)
  }, [theme])

  // On mount: hydrate from PouchDB (overrides localStorage if db has a value)
  useEffect(() => {
    getSettings()
      .then(settings => {
        if (settings.theme !== 'system') setTheme(settings.theme)
      })
      .catch(() => {})
  }, [])

  const toggle = () => {
    setTheme(current => {
      const next: Theme = current === 'light' ? 'dark' : 'light'
      saveSettings({ theme: next }).catch(() => {})
      return next
    })
  }

  return { theme, toggle }
}
