import { useState } from 'react'
import { parseRMToSen } from '../../../lib/money'
import { openShift } from '../api'

export function OpenShiftModal({
  merchantId,
  outletId,
  deviceId,
  staffId,
  onCancel,
  onOpened,
}: {
  merchantId: string
  outletId: string
  deviceId: string
  staffId: string
  onCancel: () => void
  onOpened: () => void
}) {
  const [floatInput, setFloatInput] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleConfirm() {
    setError(null)
    let openingFloatSen: number
    try {
      openingFloatSen = parseRMToSen(floatInput || '0')
    } catch {
      setError('Enter a valid amount, e.g. 100.00')
      return
    }

    setSubmitting(true)
    try {
      await openShift({ merchantId, outletId, deviceId, staffId, openingFloatSen })
      onOpened()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not open shift')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 sm:items-center">
      <div className="w-full max-w-sm rounded-t-xl bg-white p-4 sm:rounded-xl">
        <h2 className="mb-1 text-lg font-semibold text-slate-800">Open shift</h2>
        <p className="mb-3 text-sm text-slate-500">Count the cash float in the drawer to start.</p>

        <label className="mb-3 block text-sm font-medium text-slate-700">
          Opening float (RM)
          <input
            value={floatInput}
            onChange={(e) => setFloatInput(e.target.value)}
            placeholder="100.00"
            className="mt-1 w-full rounded border border-slate-300 px-3 py-2 text-lg"
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
            {submitting ? 'Opening…' : 'Open shift'}
          </button>
        </div>
      </div>
    </div>
  )
}
