import { useEffect, useRef, useState } from 'react'
import './VideoMenu.css'

export interface VideoMenuAction {
  label: string
  onSelect: () => void | Promise<void>
  /** Replaces the label briefly after selection, e.g. to confirm a copy. */
  confirmation?: string
}

interface VideoMenuProps {
  actions: VideoMenuAction[]
  label?: string
}

/** How long a confirmation label stays visible before reverting. */
const CONFIRM_MS = 1200

export default function VideoMenu({ actions, label = 'Video options' }: VideoMenuProps) {
  const [open, setOpen] = useState(false)
  const [confirmed, setConfirmed] = useState<number | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Dismiss on outside click or Escape, matching normal menu behaviour.
  useEffect(() => {
    if (!open) return

    const onPointerDown = (e: PointerEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) setOpen(false)
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  useEffect(() => {
    if (confirmed === null) return
    const timer = setTimeout(() => setConfirmed(null), CONFIRM_MS)
    return () => clearTimeout(timer)
  }, [confirmed])

  async function handleSelect(action: VideoMenuAction, index: number) {
    try {
      await action.onSelect()
    } catch {
      // Nothing here is critical enough to interrupt the user with an error.
    }
    if (action.confirmation) {
      setConfirmed(index)
    } else {
      setOpen(false)
    }
  }

  return (
    <div className="video-menu" ref={containerRef}>
      <button
        type="button"
        className="video-menu-trigger"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={e => {
          // The card is wrapped in links; don't navigate when opening the menu.
          e.preventDefault()
          e.stopPropagation()
          setOpen(o => !o)
        }}
      >
        <svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true">
          <circle cx="12" cy="5" r="2" fill="currentColor" />
          <circle cx="12" cy="12" r="2" fill="currentColor" />
          <circle cx="12" cy="19" r="2" fill="currentColor" />
        </svg>
      </button>

      {open && (
        <div className="video-menu-items" role="menu">
          {actions.map((action, i) => (
            <button
              key={action.label}
              type="button"
              role="menuitem"
              className="video-menu-item"
              onClick={e => {
                e.preventDefault()
                e.stopPropagation()
                void handleSelect(action, i)
              }}
            >
              {confirmed === i ? action.confirmation : action.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
