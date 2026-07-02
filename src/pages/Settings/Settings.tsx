import { useEffect, useState } from 'react'
import { useTheme } from '../../contexts/ThemeContext'
import { pluginManager } from '../../plugins/manager'
import { InvidiousPlugin, fetchInvidiousInstances, type InvidiousInstanceInfo } from '../../plugins/invidious/index'
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

  const [ytCookieDraft, setYtCookieDraft] = useState('')
  const [ytCookieSaved, setYtCookieSaved] = useState(false)

  const [invInstance, setInvInstance] = useState('')
  const [invDraft, setInvDraft] = useState('')
  const [invInstances, setInvInstances] = useState<InvidiousInstanceInfo[]>([])
  const [invFetchState, setInvFetchState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle')

  useEffect(() => {
    getSettings().then(s => {
      setActivePluginState(s.activePlugin)
      setWatchedStyleState(s.watchedVideoStyle ?? 'normal')
      setYtCookieDraft(s.ytCookie ?? '')
      setYtCookieSaved(!!(s.ytCookie))
      const inst = s.invidiousInstance ?? ''
      setInvInstance(inst)
      setInvDraft(inst)
    }).catch(() => {})
  }, [])

  function handleSaveCookie() {
    const cookie = ytCookieDraft.trim()
    saveSettings({ ytCookie: cookie }).catch(() => {})
    window.ytjs?.setCookie(cookie)
    setYtCookieSaved(!!cookie)
  }

  function handleClearCookie() {
    setYtCookieDraft('')
    saveSettings({ ytCookie: '' }).catch(() => {})
    window.ytjs?.setCookie('')
    setYtCookieSaved(false)
  }

  function handleSaveInstance(url: string) {
    const trimmed = url.trim().replace(/\/+$/, '')
    setInvInstance(trimmed)
    setInvDraft(trimmed)
    InvidiousPlugin.setInstance(trimmed)
    saveSettings({ invidiousInstance: trimmed }).catch(() => {})
  }

  async function handleDiscoverInstances() {
    setInvFetchState('loading')
    setInvInstances([])
    try {
      const list = await fetchInvidiousInstances()
      setInvInstances(list.slice(0, 20))
      setInvFetchState('done')
    } catch {
      setInvFetchState('error')
    }
  }

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

        {/* ── Invidious ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">Invidious Instance</h3>
          <p className="inv-hint">
            Choose a public Invidious instance or enter your own. The instance must have the API enabled (✅) to work with NeoTube.
          </p>
          {invInstance && (
            <p className="inv-current">
              Active: <span className="inv-current-url">{invInstance}</span>
            </p>
          )}
          <div className="inv-input-row">
            <input
              className="inv-url-input"
              type="url"
              placeholder="https://invidious.example.com"
              value={invDraft}
              onChange={e => setInvDraft(e.target.value)}
              spellCheck={false}
            />
            <Button
              onClick={() => handleSaveInstance(invDraft)}
              disabled={!invDraft.trim() || invDraft.trim() === invInstance}
            >
              Save
            </Button>
          </div>

          <div className="inv-discover-row">
            <Button onClick={handleDiscoverInstances} disabled={invFetchState === 'loading'}>
              {invFetchState === 'loading' ? 'Searching…' : 'Find public instances'}
            </Button>
            {invFetchState === 'error' && (
              <span className="inv-error">Failed to fetch instance list</span>
            )}
          </div>

          {invFetchState === 'done' && invInstances.length > 0 && (
            <div className="inv-instance-list">
              {invInstances.map(inst => (
                <button
                  key={inst.uri}
                  className={`inv-instance-row${inst.uri === invInstance ? ' inv-instance-active' : ''}`}
                  onClick={() => handleSaveInstance(inst.uri)}
                  type="button"
                >
                  <span className="inv-instance-flag">{inst.flag}</span>
                  <span className="inv-instance-uri">{inst.uri.replace('https://', '')}</span>
                  <span className="inv-instance-region">{inst.region}</span>
                  <span className="inv-instance-uptime">{inst.hasApi ? '✅' : '❌'} {inst.uptime.toFixed(1)}%</span>
                </button>
              ))}
            </div>
          )}
        </section>

        {/* ── YouTube Account ── */}
        <section className="settings-section">
          <h3 className="settings-section-title">YouTube Account</h3>
          <p className="yt-cookie-hint">
            Paste your YouTube session cookie to enable high-quality streams (720p+).
            In a browser signed into YouTube, open DevTools → Network → copy the full
            <code> Cookie:</code> header value from any youtube.com request.
          </p>
          <textarea
            className="yt-cookie-input"
            rows={3}
            placeholder="VISITOR_INFO1_LIVE=...; __Secure-1PSID=..."
            value={ytCookieDraft}
            onChange={e => setYtCookieDraft(e.target.value)}
            spellCheck={false}
          />
          <div className="yt-cookie-actions">
            <Button onClick={handleSaveCookie} disabled={ytCookieDraft.trim() === ''}>
              Save cookie
            </Button>
            {ytCookieSaved && (
              <Button onClick={handleClearCookie}>Clear</Button>
            )}
            {ytCookieSaved && <span className="yt-cookie-status">Cookie saved</span>}
          </div>
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
