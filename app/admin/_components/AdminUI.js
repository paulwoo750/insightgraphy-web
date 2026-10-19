'use client'

export function AdminPage({ children, className = '' }) {
  return (
    <div className={`mx-auto w-full max-w-[1440px] px-4 py-6 sm:px-6 lg:px-8 lg:py-8 ${className}`}>
      {children}
    </div>
  )
}

export function PageHeader({ eyebrow, title, description, actions }) {
  return (
    <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-bold uppercase text-teal-700">{eyebrow}</p>}
        <h1 className="text-2xl font-bold text-slate-950 sm:text-[28px]">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm leading-6 text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  )
}

export function Panel({ title, description, action, children, className = '' }) {
  return (
    <section className={`overflow-hidden rounded-md border border-slate-200 bg-white ${className}`}>
      {(title || action) && (
        <div className="flex min-h-14 items-center justify-between gap-4 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-bold text-slate-900">{title}</h2>}
            {description && <p className="mt-0.5 text-xs text-slate-500">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
      )}
      {children}
    </section>
  )
}

export function StatusBadge({ tone = 'gray', children }) {
  const tones = {
    teal: 'bg-teal-50 text-teal-800 ring-teal-200',
    green: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
    amber: 'bg-amber-50 text-amber-800 ring-amber-200',
    red: 'bg-red-50 text-red-700 ring-red-200',
    blue: 'bg-blue-50 text-blue-700 ring-blue-200',
    gray: 'bg-slate-100 text-slate-600 ring-slate-200',
  }

  return (
    <span className={`inline-flex min-h-6 items-center rounded-full px-2 text-[11px] font-bold ring-1 ring-inset ${tones[tone] || tones.gray}`}>
      {children}
    </span>
  )
}

export function EmptyState({ title, description }) {
  return (
    <div className="px-5 py-12 text-center">
      <p className="text-sm font-bold text-slate-700">{title}</p>
      {description && <p className="mt-1 text-xs leading-5 text-slate-500">{description}</p>}
    </div>
  )
}
