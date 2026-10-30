import { useState, type ReactNode } from 'react'

/** A delete-style button that asks for one extra click before firing, instead of a native confirm(). */
export function ConfirmButton({
  onConfirm,
  children,
  className,
}: {
  onConfirm: () => void
  children: ReactNode
  className?: string
}) {
  const [confirming, setConfirming] = useState(false)

  if (confirming) {
    return (
      <span className="inline-flex items-center gap-1">
        <button
          type="button"
          onClick={() => {
            setConfirming(false)
            onConfirm()
          }}
          className="rounded bg-red-600 px-3 py-2 text-sm text-white"
        >
          Confirm
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
        >
          Cancel
        </button>
      </span>
    )
  }

  return (
    <button type="button" onClick={() => setConfirming(true)} className={className}>
      {children}
    </button>
  )
}
