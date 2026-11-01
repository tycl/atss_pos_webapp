import { useState } from 'react'
import { verifyApproverPin } from '../../auth/pinLogin'
import { formatSenAsRM, parseRMToSen } from '../../../lib/money'
import type { Order, Settings } from '../../../lib/types'
import { applyDiscount } from '../orderApi'

export function DiscountModal({
  order,
  settings,
  onCancel,
  onApplied,
}: {
  order: Order
  settings: Settings
  onCancel: () => void
  onApplied: () => void
}) {
  const [pin, setPin] = useState('')
  const [amountInput, setAmountInput] = useState(
    order.discount_sen > 0 ? (order.discount_sen / 100).toFixed(2) : '',
  )
  const [reason, setReason] = useState(order.discount_reason ?? '')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    setError(null)

    let discountSen: number
    try {
      discountSen = parseRMToSen(amountInput || '0')
    } catch {
      setError('Enter a valid amount, e.g. 5.00')
      return
    }
    if (discountSen > order.subtotal_sen) {
      setError('Discount cannot exceed the subtotal')
      return
    }
    if (discountSen > 0 && !reason.trim()) {
      setError('A reason is required')
      return
    }

    setSubmitting(true)
    try {
      const approver = await verifyApproverPin(pin)
      if (!approver) {
        setError('Incorrect manager/owner PIN')
        return
      }
      await applyDiscount(order.id, approver.id, discountSen, reason, settings)
      onApplied()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not apply discount')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-xl bg-white p-4 sm:rounded-xl">
        <h2 className="mb-1 text-lg font-semibold text-slate-800">
          Discount order {order.order_no}
        </h2>
        <p className="mb-3 text-sm text-slate-500">
          Requires a manager or owner PIN. Subtotal is {formatSenAsRM(order.subtotal_sen)}.
        </p>

        <label className="mb-3 block text-sm font-medium text-slate-700">
          Manager/owner PIN
          <input
            type="password"
            inputMode="numeric"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="mb-3 block text-sm font-medium text-slate-700">
          Discount amount (RM)
          <input
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder="0.00"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <label className="mb-3 block text-sm font-medium text-slate-700">
          Reason
          <textarea
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            rows={2}
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
          />
        </label>

        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded border border-slate-300 py-2 text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting}
            onClick={() => void handleConfirm()}
            className="flex-1 rounded bg-slate-800 py-2 text-white disabled:opacity-50"
          >
            {submitting ? 'Saving…' : 'Apply discount'}
          </button>
        </div>
      </div>
    </div>
  )
}
