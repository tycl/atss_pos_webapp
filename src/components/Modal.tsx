import type { ReactNode } from 'react'

/**
 * Shared bottom-sheet-on-mobile / centered-on-desktop shell — replaces the
 * `fixed inset-0 bg-black/40` + `rounded-t-xl sm:rounded-xl` panel pattern
 * duplicated across the ordering modals. No backdrop-dismiss or Escape
 * handling — matches what those modals already did, this only dedups markup.
 */
export function Modal({
  title,
  maxWidthClassName = 'max-w-md',
  children,
}: {
  title?: string
  maxWidthClassName?: string
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div
        className={`max-h-[85vh] w-full ${maxWidthClassName} overflow-y-auto rounded-t-xl bg-white p-4 sm:rounded-xl`}
      >
        {title && <h2 className="mb-3 text-lg font-semibold text-slate-800">{title}</h2>}
        {children}
      </div>
    </div>
  )
}
