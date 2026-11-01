import { useState } from 'react'
import { Button } from '../../../components/Button'
import { Modal } from '../../../components/Modal'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import type { OrderType } from '../../../lib/types'
import { listTables } from '../../tables/api'
import { listOpenOrders } from '../orderApi'

export function PlaceOrderModal({
  outletId,
  onCancel,
  onConfirm,
}: {
  outletId: string
  onCancel: () => void
  onConfirm: (type: OrderType, tableId: string | null) => void
}) {
  const tables = useLiveQuery(() => listTables(outletId), [outletId], [])
  const openOrders = useLiveQuery(() => listOpenOrders(outletId), [outletId], [])
  const occupiedTableIds = new Set(
    openOrders.filter((o) => o.table_id !== null).map((o) => o.table_id as string),
  )

  const [type, setType] = useState<OrderType | null>(null)
  const [tableId, setTableId] = useState<string | null>(null)

  function handleConfirm() {
    if (type === 'dine_in') {
      if (!tableId) return
      onConfirm('dine_in', tableId)
      return
    }
    if (type === 'takeaway') {
      onConfirm('takeaway', null)
    }
  }

  const canConfirm = type === 'takeaway' || (type === 'dine_in' && tableId !== null)

  return (
    <Modal title="Place order">
      <div className="mb-4 flex gap-2">
        <button
          type="button"
          onClick={() => {
            setType('dine_in')
            setTableId(null)
          }}
          className={`flex-1 rounded border py-2 text-sm font-medium ${
            type === 'dine_in'
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-slate-300 text-slate-700'
          }`}
        >
          Dine-in
        </button>
        <button
          type="button"
          onClick={() => {
            setType('takeaway')
            setTableId(null)
          }}
          className={`flex-1 rounded border py-2 text-sm font-medium ${
            type === 'takeaway'
              ? 'border-primary-600 bg-primary-600 text-white'
              : 'border-slate-300 text-slate-700'
          }`}
        >
          Takeaway
        </button>
      </div>

      {type === 'dine_in' && (
        <div className="mb-4">
          <p className="mb-2 text-sm font-medium text-slate-700">Choose a table</p>
          {tables.length === 0 && (
            <p className="text-sm text-slate-500">
              No tables set up yet — add some from the back office.
            </p>
          )}
          <div className="grid grid-cols-3 gap-2">
            {tables.map((table) => {
              const occupied = occupiedTableIds.has(table.id)
              return (
                <button
                  key={table.id}
                  type="button"
                  disabled={occupied}
                  onClick={() => setTableId(table.id)}
                  className={`rounded border px-2 py-2 text-sm ${
                    occupied
                      ? 'cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400'
                      : table.id === tableId
                        ? 'border-primary-600 bg-primary-600 text-white'
                        : 'border-slate-300 text-slate-700'
                  }`}
                >
                  {table.name}
                  {occupied && <span className="block text-xs">occupied</span>}
                </button>
              )
            })}
          </div>
        </div>
      )}

      <div className="flex gap-2">
        <Button variant="outline" size="md" fullWidth onClick={onCancel}>
          Cancel
        </Button>
        <Button
          variant="primary"
          size="md"
          fullWidth
          disabled={!canConfirm}
          onClick={handleConfirm}
        >
          Confirm
        </Button>
      </div>
    </Modal>
  )
}
