import './PageLayout.css'

interface PageLayoutProps {
  title?: string
  subtitle?: string
  icon?: React.ReactNode
  /** Wide header image rendered above the title. */
  banner?: string
  actions?: React.ReactNode
  extra?: React.ReactNode
  tabs?: React.ReactNode
  children: React.ReactNode
  className?: string
}

export default function PageLayout({
  title,
  subtitle,
  icon,
  banner,
  actions,
  extra,
  tabs,
  children,
  className,
}: PageLayoutProps) {
  const hasHeader = title || icon || actions

  return (
    <div className={`page${className ? ` ${className}` : ''}`}>
      {banner && (
        <div className="page-banner">
          <img src={banner} alt="" loading="lazy" />
        </div>
      )}
      {hasHeader && (
        <div className="page-header">
          {(icon || title || subtitle) && (
            <div className="page-identity">
              {icon && <div className="page-icon">{icon}</div>}
              {(title || subtitle) && (
                <div className="page-titles">
                  {title && <h1 className="page-title">{title}</h1>}
                  {subtitle && <p className="page-subtitle">{subtitle}</p>}
                </div>
              )}
            </div>
          )}
          {actions && <div className="page-actions">{actions}</div>}
        </div>
      )}
      {extra}
      {tabs}
      {children}
    </div>
  )
}
