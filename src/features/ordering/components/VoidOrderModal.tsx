import { useState } from 'react'
import { verifyApproverPin } from '../../auth/pinLogin'
import type { Order } from '../../../lib/types'
import { voidOrder } from '../orderApi'

export function VoidOrderModal({
  order,
  onCancel,
  onVoided,
}: {
  order: Order
  onCancel: () => void
  onVoided: () => void
}) {
  const [pin, setPin] = useState('')
  const [reason, setReason] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    setError(null)
    if (!reason.trim()) {
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
      await voidOrder(order.id, approver.id, reason)
      onVoided()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not void order')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-xl bg-white p-4 sm:rounded-xl">
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Void order {order.order_no}</h2>
        <p className="mb-3 text-sm text-slate-500">Requires a manager or owner PIN.</p>

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
            className="flex-1 rounded bg-red-600 py-2 text-white disabled:opacity-50"
          >
            {submitting ? 'Voiding…' : 'Void order'}
          </button>
        </div>
      </div>
    </div>
  )
}
