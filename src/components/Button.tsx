import type { ButtonHTMLAttributes, ReactNode } from 'react'

const VARIANT_CLASSES = {
  primary:
    'bg-primary-600 text-white hover:bg-primary-700 active:bg-primary-800 disabled:bg-slate-300 disabled:text-slate-500',
  secondary: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
  outline: 'border border-slate-300 bg-white text-slate-700 hover:bg-slate-50',
  danger: 'bg-red-600 text-white hover:bg-red-700',
  'danger-outline': 'border border-red-200 bg-white text-red-600 hover:bg-red-50',
}

const SIZE_CLASSES = {
  md: 'h-11 px-4 text-sm',
  lg: 'h-14 px-6 text-base',
}

/** Shared action button (Cancel/Confirm/Place order/Remove) — not for selection chips. */
export function Button({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
  children,
  ...rest
}: {
  variant?: 'primary' | 'secondary' | 'outline' | 'danger' | 'danger-outline'
  size?: 'md' | 'lg'
  fullWidth?: boolean
  className?: string
  children: ReactNode
} & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      className={`rounded-lg font-medium transition disabled:cursor-not-allowed disabled:opacity-60 ${
        VARIANT_CLASSES[variant]
      } ${SIZE_CLASSES[size]} ${fullWidth ? 'w-full' : ''} ${className ?? ''}`}
      {...rest}
    >
      {children}
    </button>
  )
}
