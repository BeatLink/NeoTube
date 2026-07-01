import { useEffect, useState } from 'react'
import { useTheme } from '../contexts/ThemeContext'
import { pluginManager } from '../plugins/manager'
import { saveSettings, getSettings } from '../db/index'
import './Settings.css'

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const [activePlugin, setActivePluginState] = useState(pluginManager.getActive().id)
  const plugins = pluginManager.list()

  // Sync initial value from db in case it differs
  useEffect(() => {
    getSettings().then(s => setActivePluginState(s.activePlugin)).catch(() => {})
  }, [])

  function handlePluginChange(id: string) {
    try {
      pluginManager.setActive(id)
      setActivePluginState(id)
      saveSettings({ activePlugin: id }).catch(() => {})
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div className="settings-page">
      <h2>Settings</h2>

      <div className="settings-sections">
        {/* ── Theme ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">Theme</h3>
          <div className="settings-options">
            {(['light', 'dark'] as const).map(t => (
              <label key={t} className={`settings-option ${theme === t ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="theme"
                  value={t}
                  checked={theme === t}
                  onChange={() => setTheme(t)}
                />
                {t === 'light' ? '☀️  Light' : '🌙  Dark'}
              </label>
            ))}
          </div>
        </section>

        {/* ── Video Source ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">Video Source</h3>
          <div className="settings-options vertical">
            {plugins.map(p => (
              <label key={p.id} className={`settings-option plugin-option ${activePlugin === p.id ? 'active' : ''}`}>
                <input
                  type="radio"
                  name="plugin"
                  value={p.id}
                  checked={activePlugin === p.id}
                  onChange={() => handlePluginChange(p.id)}
                />
                <div>
                  <span className="plugin-name">{p.name}</span>
                  <span className="plugin-desc">{p.description}</span>
                </div>
              </label>
            ))}
          </div>
        </section>
      </div>
    </div>
  )
}
