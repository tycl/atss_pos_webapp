import type { ReactNode } from 'react'

const PADDING_CLASSES = {
  none: '',
  sm: 'p-3',
  md: 'p-4',
}

/** Shared white elevated panel — replaces the repeated `rounded-lg bg-white p-4 shadow`. */
export function Card({
  padding = 'md',
  className,
  children,
}: {
  padding?: 'none' | 'sm' | 'md'
  className?: string
  children: ReactNode
}) {
  return (
    <div
      className={`rounded-xl bg-white shadow-card ${PADDING_CLASSES[padding]} ${className ?? ''}`}
    >
      {children}
    </div>
  )
}
