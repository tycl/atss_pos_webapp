import { useState } from 'react'
import { calculateTotals } from '../../../lib/calculateTotals'
import type { CartLine } from '../../../lib/cart'
import { cartSubtotalSen, cartLineTotalSen } from '../../../lib/cart'
import { formatSenAsRM } from '../../../lib/money'
import type { Settings } from '../../../lib/types'

export function CartPanel({
  lines,
  settings,
  onUpdateQty,
  onUpdateNote,
  onRemove,
  onPlaceOrder,
  placeOrderLabel = 'Place order',
  placing = false,
}: {
  lines: CartLine[]
  settings: Settings | null
  onUpdateQty: (lineId: string, qty: number) => void
  onUpdateNote: (lineId: string, note: string) => void
  onRemove: (lineId: string) => void
  onPlaceOrder: () => void
  placeOrderLabel?: string
  placing?: boolean
}) {
  const subtotalSen = cartSubtotalSen(lines)

  // Cash rounding depends on the payment method, chosen later at checkout —
  // preview with 'duitnow_qr' so rounding stays 0 here and this is an exact
  // preview of subtotal/service charge/SST; the cash total may still shift
  // by up to ±2 sen once a payment method is picked.
  const totals = settings
    ? calculateTotals({ subtotalSen, paymentMethod: 'duitnow_qr', settings })
    : null

  return (
    <div className="flex h-full flex-col border-l border-slate-200 bg-white">
      <h2 className="border-b border-slate-200 px-4 py-3 font-semibold text-slate-800">Cart</h2>

      <div className="flex-1 overflow-y-auto">
        {lines.length === 0 && <p className="p-4 text-sm text-slate-500">Cart is empty.</p>}
        <ul className="divide-y divide-slate-100">
          {lines.map((line) => (
            <CartLineRow
              key={line.lineId}
              line={line}
              onUpdateQty={onUpdateQty}
              onUpdateNote={onUpdateNote}
              onRemove={onRemove}
            />
          ))}
        </ul>
      </div>

      <div className="space-y-1 border-t border-slate-200 px-4 py-3 text-sm">
        <div className="flex justify-between text-slate-600">
          <span>Subtotal</span>
          <span>{formatSenAsRM(subtotalSen)}</span>
        </div>
        {totals && totals.service_charge_sen > 0 && (
          <div className="flex justify-between text-slate-600">
            <span>Service charge</span>
            <span>{formatSenAsRM(totals.service_charge_sen)}</span>
          </div>
        )}
        {totals && totals.sst_sen > 0 && (
          <div className="flex justify-between text-slate-600">
            <span>SST</span>
            <span>{formatSenAsRM(totals.sst_sen)}</span>
          </div>
        )}
        <div className="flex justify-between text-base font-semibold text-slate-900">
          <span>Total</span>
          <span>{formatSenAsRM(totals?.total_sen ?? subtotalSen)}</span>
        </div>
      </div>

      <button
        type="button"
        disabled={lines.length === 0 || placing}
        onClick={onPlaceOrder}
        className="m-3 rounded bg-slate-800 py-3 font-medium text-white disabled:bg-slate-300"
      >
        {placing ? 'Placing…' : placeOrderLabel}
      </button>
    </div>
  )
}

function CartLineRow({
  line,
  onUpdateQty,
  onUpdateNote,
  onRemove,
}: {
  line: CartLine
  onUpdateQty: (lineId: string, qty: number) => void
  onUpdateNote: (lineId: string, note: string) => void
  onRemove: (lineId: string) => void
}) {
  const [showNote, setShowNote] = useState(Boolean(line.note))

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium text-slate-800">{line.name}</p>
          {line.modifiers.length > 0 && (
            <p className="text-xs text-slate-500">{line.modifiers.map((m) => m.name).join(', ')}</p>
          )}
          <button
            type="button"
            onClick={() => setShowNote((v) => !v)}
            className="-ml-2 px-2 py-2 text-xs text-slate-500 underline"
          >
            {line.note ? 'Edit note' : 'Add note'}
          </button>
        </div>
        <span className="whitespace-nowrap text-sm font-medium text-slate-700">
          {formatSenAsRM(cartLineTotalSen(line))}
        </span>
      </div>

      {showNote && (
        <input
          defaultValue={line.note ?? ''}
          onBlur={(e) => onUpdateNote(line.lineId, e.target.value)}
          placeholder="e.g. less ice"
          className="mt-1 w-full rounded border border-slate-300 px-2 py-1 text-sm"
        />
      )}

      <div className="mt-2 flex items-center gap-2">
        <button
          type="button"
          onClick={() => onUpdateQty(line.lineId, line.qty - 1)}
          className="h-11 w-11 rounded-full border border-slate-300 text-lg"
        >
          −
        </button>
        <span className="w-5 text-center text-sm">{line.qty}</span>
        <button
          type="button"
          onClick={() => onUpdateQty(line.lineId, line.qty + 1)}
          className="h-11 w-11 rounded-full border border-slate-300 text-lg"
        >
          +
        </button>
        <button
          type="button"
          onClick={() => onRemove(line.lineId)}
          className="ml-auto px-3 py-2 text-xs text-red-600"
        >
          Remove
        </button>
      </div>
    </li>
  )
}
