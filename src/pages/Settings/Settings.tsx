import { useEffect, useState } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { pluginManager } from '../../plugins/manager'
import { saveSettings, getSettings, subscribe, recordWatch } from '../../db/index'
import { downloadAvatar } from '../../utils/avatar'
import PageLayout from '../../components/PageLayout'
import MenuButton from '../../components/MenuButton'
import Button from '../../components/Button'
import './Settings.css'

// ─── FreeTube import types ────────────────────────────────────────────────────

type FtSub = { id: string; name: string; thumbnail: string }
type FtHistEntry = {
  videoId: string; title: string; channelId: string; channelName: string
  thumbnail: string; duration: number; watchedAt: string
}
type FtData = { subscriptions: FtSub[]; history: FtHistEntry[] }

declare global {
  interface Window {
    freetube?: {
      scan(): Promise<string[]>
      readData(dir: string): Promise<FtData>
    }
  }
}

type ImportPhase =
  | { status: 'idle' }
  | { status: 'scanning' }
  | { status: 'not-found' }
  | { status: 'preview'; dir: string; data: FtData }
  | { status: 'importing' }
  | { status: 'done'; subs: number; hist: number }
  | { status: 'error'; message: string }

// ─── Component ────────────────────────────────────────────────────────────────

export default function Settings() {
  const { theme, setTheme } = useTheme()
  const [activePlugin, setActivePluginState] = useState(pluginManager.getActive().id)
  const [watchedStyle, setWatchedStyleState] = useState<'normal' | 'dim' | 'hide'>('normal')
  const plugins = pluginManager.list()

  const [importState, setImportState] = useState<ImportPhase>({ status: 'idle' })
  const [importSubs, setImportSubs] = useState(true)
  const [importHist, setImportHist] = useState(true)

  useEffect(() => {
    getSettings().then(s => {
      setActivePluginState(s.activePlugin)
      setWatchedStyleState(s.watchedVideoStyle ?? 'normal')
    }).catch(() => {})
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

  function handleWatchedStyleChange(style: 'normal' | 'dim' | 'hide') {
    setWatchedStyleState(style)
    saveSettings({ watchedVideoStyle: style }).catch(() => {})
  }

  async function handleScan() {
    if (!window.freetube) return
    setImportState({ status: 'scanning' })
    try {
      const dirs = await window.freetube.scan()
      if (!dirs.length) { setImportState({ status: 'not-found' }); return }
      const dir = dirs[0]
      const data = await window.freetube.readData(dir)
      setImportState({ status: 'preview', dir, data })
    } catch (e) {
      setImportState({ status: 'error', message: (e as Error).message })
    }
  }

  async function handleImport() {
    if (importState.status !== 'preview') return
    const { data } = importState
    setImportState({ status: 'importing' })
    let subsImported = 0
    let histImported = 0
    try {
      if (importSubs) {
        for (const sub of data.subscriptions) {
          await subscribe(sub.id, sub.name)
          subsImported++
        }
      }
      if (importHist) {
        for (const entry of data.history) {
          await recordWatch(
            entry.videoId, entry.title, entry.channelId,
            entry.channelName,
            entry.thumbnail || `https://i.ytimg.com/vi/${entry.videoId}/hqdefault.jpg`,
            entry.duration,
          )
          histImported++
        }
      }
      setImportState({ status: 'done', subs: subsImported, hist: histImported })

      if (importSubs && data.subscriptions.length > 0) {
        let plugin
        try { plugin = pluginManager.getActive() } catch { /* no plugin active */ }
        if (plugin) {
          const subs = data.subscriptions
          ;(async () => {
            for (let i = 0; i < subs.length; i++) {
              if (i > 0) await new Promise<void>(r => setTimeout(r, 800))
              const sub = subs[i]
              try {
                const info = await plugin!.getChannelInfo(sub.id)
                if (info.avatar) {
                  const blob = await downloadAvatar(info.avatar)
                  if (blob) await subscribe(sub.id, sub.name, blob)
                }
              } catch { /* skip unreachable channels */ }
            }
          })()
        }
      }
    } catch (e) {
      setImportState({ status: 'error', message: (e as Error).message })
    }
  }

  const isElectron = typeof window.freetube !== 'undefined'
  const activePluginInfo = plugins.find(p => p.id === activePlugin)

  return (
    <PageLayout title="Settings">
      <div className="settings-sections">

        {/* ── Theme ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">Theme</h3>
          <MenuButton
            options={[
              { value: 'light', label: '☀️  Light' },
              { value: 'dark', label: '🌙  Dark' },
            ]}
            value={theme}
            onChange={v => setTheme(v as 'light' | 'dark')}
          />
        </section>

        {/* ── Previously Watched ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">Previously Watched</h3>
          <MenuButton
            options={[
              { value: 'normal', label: 'Normal' },
              { value: 'dim', label: 'Dim' },
              { value: 'hide', label: 'Hide' },
            ]}
            value={watchedStyle}
            onChange={v => handleWatchedStyleChange(v as 'normal' | 'dim' | 'hide')}
          />
        </section>

        {/* ── Video Source ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">Video Source</h3>
          <MenuButton
            options={plugins.map(p => ({ value: p.id, label: p.name }))}
            value={activePlugin}
            onChange={handlePluginChange}
          />
          {activePluginInfo && (
            <div className="plugin-info">
              <p>{activePluginInfo.description}</p>
            </div>
          )}
        </section>

        {/* ── Import from FreeTube ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">Import from FreeTube</h3>

          {!isElectron ? (
            <p className="ft-unavailable">Available in the desktop app only.</p>
          ) : (
            <div className="ft-import">
              {(importState.status === 'idle' || importState.status === 'not-found') && (
                <>
                  <Button className="ft-scan-btn" onClick={handleScan}>
                    Find FreeTube Data
                  </Button>
                  {importState.status === 'not-found' && (
                    <p className="ft-msg ft-msg-warn">
                      No FreeTube installation found. Install FreeTube or check that it has been run at least once.
                    </p>
                  )}
                </>
              )}

              {importState.status === 'scanning' && (
                <p className="ft-msg">Searching for FreeTube data…</p>
              )}

              {importState.status === 'preview' && (
                <>
                  <p className="ft-path">{importState.dir}</p>
                  <div className="ft-checks">
                    <label className={`ft-check ${!importState.data.subscriptions.length ? 'ft-check-empty' : ''}`}>
                      <input
                        type="checkbox"
                        checked={importSubs}
                        disabled={!importState.data.subscriptions.length}
                        onChange={e => setImportSubs(e.target.checked)}
                      />
                      <span>
                        Subscriptions
                        <span className="ft-count">{importState.data.subscriptions.length}</span>
                      </span>
                    </label>
                    <label className={`ft-check ${!importState.data.history.length ? 'ft-check-empty' : ''}`}>
                      <input
                        type="checkbox"
                        checked={importHist}
                        disabled={!importState.data.history.length}
                        onChange={e => setImportHist(e.target.checked)}
                      />
                      <span>
                        Watch history
                        <span className="ft-count">{importState.data.history.length}</span>
                      </span>
                    </label>
                  </div>
                  <div className="ft-actions">
                    <Button
                      variant="danger"
                      className="ft-import-btn"
                      onClick={handleImport}
                      disabled={!importSubs && !importHist}
                    >
                      Import
                    </Button>
                    <Button
                      className="ft-cancel-btn"
                      onClick={() => setImportState({ status: 'idle' })}
                    >
                      Cancel
                    </Button>
                  </div>
                </>
              )}

              {importState.status === 'importing' && (
                <p className="ft-msg">Importing…</p>
              )}

              {importState.status === 'done' && (
                <>
                  <p className="ft-msg ft-msg-ok">
                    Import complete —
                    {importState.subs > 0 && ` ${importState.subs} subscription${importState.subs !== 1 ? 's' : ''}`}
                    {importState.subs > 0 && importState.hist > 0 && ','}
                    {importState.hist > 0 && ` ${importState.hist} history entr${importState.hist !== 1 ? 'ies' : 'y'}`}
                    {importState.subs === 0 && importState.hist === 0 && ' nothing to import'}
                  </p>
                  <Button
                    className="ft-scan-btn"
                    onClick={() => setImportState({ status: 'idle' })}
                  >
                    Import again
                  </Button>
                </>
              )}

              {importState.status === 'error' && (
                <>
                  <p className="ft-msg ft-msg-error">{importState.message}</p>
                  <Button className="ft-scan-btn" onClick={() => setImportState({ status: 'idle' })}>
                    Try again
                  </Button>
                </>
              )}
            </div>
          )}
        </section>

      </div>
    </PageLayout>
  )
}
