import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { isSubscribed, subscribe, unsubscribe } from '../../db/index'
import Button from '../Button'
import './ChannelCard.css'

interface ChannelCardProps {
  channelId: string
  name: string
  avatar?: string
  /** Optional line under the name, e.g. "25.4M subscribers". */
  meta?: string
  /** Called after the subscription state changes, so lists can refresh. */
  onSubscriptionChange?: (subscribed: boolean) => void
}

/**
 * Avatar-and-name card with an inline subscribe toggle. Shared by the
 * subscriptions grid and a channel's featured-channels tab.
 */
export default function ChannelCard({
  channelId, name, avatar, meta, onSubscriptionChange,
}: ChannelCardProps) {
  // null while unknown, so the button doesn't flash the wrong label.
  const [subscribed, setSubscribed] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    isSubscribed(channelId)
      .then(value => { if (!cancelled) setSubscribed(value) })
      .catch(() => { if (!cancelled) setSubscribed(false) })
    return () => { cancelled = true }
  }, [channelId])

  async function toggle() {
    if (subscribed === null || busy) return
    setBusy(true)
    try {
      if (subscribed) await unsubscribe(channelId)
      else await subscribe(channelId, name, avatar)
      setSubscribed(!subscribed)
      onSubscriptionChange?.(!subscribed)
    } catch {
      // Leave the previous state visible rather than lying about the result.
    } finally {
      setBusy(false)
    }
  }

  return (
    <li className="channel-card">
      <Link to={`/channel/${channelId}`} className="channel-card-link">
        {avatar
          ? <img className="channel-card-avatar" src={avatar} alt="" loading="lazy" />
          : <div className="channel-card-avatar channel-card-avatar-initial" aria-hidden="true">
              {name.charAt(0).toUpperCase()}
            </div>
        }
        <p className="channel-card-name">{name}</p>
        {meta && <p className="channel-card-meta">{meta}</p>}
      </Link>
      <Button
        size="sm"
        className={`channel-card-sub${subscribed ? ' subscribed' : ''}`}
        onClick={toggle}
        disabled={subscribed === null || busy}
        aria-label={subscribed ? `Unsubscribe from ${name}` : `Subscribe to ${name}`}
      >
        {subscribed === null ? '…' : subscribed ? 'Subscribed' : 'Subscribe'}
      </Button>
    </li>
  )
}
