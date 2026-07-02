import './MenuButton.css'

interface Option {
  value: string
  label: string
}

interface MenuButtonProps {
  options: Option[]
  value: string
  onChange: (value: string) => void
  className?: string
}

export default function MenuButton({ options, value, onChange, className }: MenuButtonProps) {
  return (
    <div className={`menu-btn-group${className ? ` ${className}` : ''}`}>
      {options.map(opt => (
        <button
          key={opt.value}
          className={`menu-btn${value === opt.value ? ' menu-btn-active' : ''}`}
          onClick={() => onChange(opt.value)}
          aria-pressed={value === opt.value}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
