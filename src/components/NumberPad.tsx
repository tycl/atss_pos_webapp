/**
 * Shared numeric keypad — a dumb emitter with no string state of its own.
 * The caller still owns the string being built (a PIN, or an RM amount) and
 * decides what each key does. Two layouts: PIN-mode (pass `onEnter`) shows
 * `⌫ 0 ↵`; amount-mode (pass `onDecimal`) shows `. 0 ⌫`.
 */
export function NumberPad({
  onDigit,
  onBackspace,
  onDecimal,
  onEnter,
  disabled = false,
}: {
  onDigit: (digit: string) => void
  onBackspace: () => void
  onDecimal?: () => void
  onEnter?: () => void
  disabled?: boolean
}) {
  const bottomRow = onEnter
    ? [
        { label: '⌫', onClick: onBackspace },
        { label: '0', onClick: () => onDigit('0') },
        { label: '↵', onClick: onEnter },
      ]
    : [
        { label: '.', onClick: onDecimal ?? (() => {}) },
        { label: '0', onClick: () => onDigit('0') },
        { label: '⌫', onClick: onBackspace },
      ]

  const keys = [
    ...['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => ({
      label: d,
      onClick: () => onDigit(d),
    })),
    ...bottomRow,
  ]

  return (
    <div className="grid grid-cols-3 gap-3">
      {keys.map((key, i) => (
        <button
          key={`${key.label}-${i}`}
          type="button"
          disabled={disabled}
          onClick={key.onClick}
          className="h-16 w-full rounded-lg bg-white text-xl font-medium text-slate-800 shadow disabled:opacity-40"
        >
          {key.label}
        </button>
      ))}
    </div>
  )
}
