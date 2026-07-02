import '../Button/Button.css'
import './ToggleButton.css'

interface ToggleButtonProps {
  active: boolean
  onClick: () => void
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
}

export default function ToggleButton({
  active, onClick, children, className, style, 'aria-label': ariaLabel,
}: ToggleButtonProps) {
  return (
    <button
      className={`btn btn-secondary btn-md toggle-btn${active ? ' toggle-btn-active' : ''}${className ? ` ${className}` : ''}`}
      style={style}
      onClick={onClick}
      aria-pressed={active}
      aria-label={ariaLabel}
    >
      {children}
    </button>
  )
}
