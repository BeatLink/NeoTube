import './Button.css'

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger'
type Size = 'sm' | 'md'

interface ButtonProps {
  variant?: Variant
  size?: Size
  type?: 'button' | 'submit' | 'reset'
  disabled?: boolean
  onClick?: () => void
  children: React.ReactNode
  className?: string
  style?: React.CSSProperties
  'aria-label'?: string
  title?: string
}

export default function Button({
  variant = 'secondary',
  size = 'md',
  type = 'button',
  disabled,
  onClick,
  children,
  className,
  style,
  'aria-label': ariaLabel,
  title,
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      onClick={onClick}
      className={`btn btn-${variant} btn-${size}${className ? ` ${className}` : ''}`}
      style={style}
      aria-label={ariaLabel}
      title={title}
    >
      {children}
    </button>
  )
}
