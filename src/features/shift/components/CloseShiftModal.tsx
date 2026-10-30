import { useState } from 'react'
import { formatSenAsRM, parseRMToSen } from '../../../lib/money'
import type { Shift } from '../../../lib/types'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import { closeShift, sumCashSalesSince } from '../api'

export function CloseShiftModal({
  shift,
  staffId,
  onCancel,
  onClosed,
}: {
  shift: Shift
  staffId: string
  onCancel: () => void
  onClosed: () => void
}) {
  const cashSales = useLiveQuery(
    () => sumCashSalesSince(shift.device_id, shift.opened_at),
    [shift.device_id, shift.opened_at],
    0,
  )
  const expectedCashSen = shift.opening_float_sen + cashSales

  const [countedInput, setCountedInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const countedCashSen = (() => {
    try {
      return parseRMToSen(countedInput || '0')
    } catch {
      return null
    }
  })()
  const varianceSen = countedCashSen !== null ? countedCashSen - expectedCashSen : null

  async function handleConfirm() {
    setError(null)
    if (countedCashSen === null) {
      setError('Enter a valid amount')
      return
    }
    setSubmitting(true)
    try {
      await closeShift(shift.id, countedCashSen, staffId)
      onClosed()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not close shift')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-xl bg-white p-4 sm:rounded-xl">
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Close shift</h2>

        <div className="mb-3 space-y-1 rounded bg-slate-50 p-3 text-sm text-slate-600">
          <div className="flex justify-between">
            <span>Opening float</span>
            <span>{formatSenAsRM(shift.opening_float_sen)}</span>
          </div>
          <div className="flex justify-between">
            <span>Cash sales</span>
            <span>{formatSenAsRM(cashSales)}</span>
          </div>
          <div className="flex justify-between font-medium text-slate-800">
            <span>Expected in drawer</span>
            <span>{formatSenAsRM(expectedCashSen)}</span>
          </div>
        </div>

        <label className="mb-2 block text-sm font-medium text-slate-700">
          Counted cash (RM)
          <input
            value={countedInput}
            onChange={(e) => setCountedInput(e.target.value)}
            placeholder="0.00"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-lg"
          />
        </label>

        {varianceSen !== null && (
          <p
            className={`mb-2 text-sm ${
              varianceSen === 0
                ? 'text-slate-600'
                : varianceSen > 0
                  ? 'text-green-700'
                  : 'text-red-600'
            }`}
          >
            Variance: {varianceSen >= 0 ? '+' : ''}
            {formatSenAsRM(varianceSen)}
          </p>
        )}

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
            {submitting ? 'Closing…' : 'Close shift'}
          </button>
        </div>
      </div>
    </div>
  )
}
