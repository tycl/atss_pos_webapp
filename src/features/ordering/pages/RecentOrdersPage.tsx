import { useState } from 'react'
import { Link, Navigate, useNavigate } from 'react-router-dom'
import { db } from '../../../lib/db'
import { getActiveOutletId } from '../../../lib/localSession'
import { formatSenAsRM } from '../../../lib/money'
import type { Order } from '../../../lib/types'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import { useStaffSession } from '../../auth/useStaffSession'
import { reprintReceipt } from '../../printing/reprintReceipt'
import { listTables } from '../../tables/api'
import { VoidOrderModal } from '../components/VoidOrderModal'
import { listRecentOrders } from '../orderApi'

const STATUS_STYLES: Record<Order['status'], string> = {
  open: 'bg-amber-100 text-amber-800',
  paid: 'bg-green-100 text-green-800',
  void: 'bg-slate-200 text-slate-500',
}

export function RecentOrdersPage() {
  const { staff } = useStaffSession()
  const navigate = useNavigate()
  const outletId = getActiveOutletId()

  const orders = useLiveQuery(
    () => (outletId ? listRecentOrders(outletId) : Promise.resolve([])),
    [outletId],
    [],
  )
  const tables = useLiveQuery(
    () => (outletId ? listTables(outletId) : Promise.resolve([])),
    [outletId],
    [],
  )
  const settings = useLiveQuery(
    () => (outletId ? db.settings.get(outletId).then((s) => s ?? null) : Promise.resolve(null)),
    [outletId],
    null,
  )

  const [voidingOrder, setVoidingOrder] = useState<Order | null>(null)
  const [reprintMessage, setReprintMessage] = useState<string | null>(null)

  if (!staff) return <Navigate to="/login" replace />
  if (!outletId) return <Navigate to="/onboarding" replace />

  const tableNameById = new Map(tables.map((t) => [t.id, t.name]))

  async function handleReprint(order: Order) {
    setReprintMessage(null)
    if (!settings?.print_bridge_url) {
      setReprintMessage('No print-bridge agent configured in Outlet settings.')
      return
    }
    try {
      await reprintReceipt(order.id, settings.print_bridge_url)
      setReprintMessage(`Receipt for ${order.order_no} sent to the printer.`)
    } catch (err) {
      setReprintMessage(
        `Could not reprint ${order.order_no}: ${err instanceof Error ? err.message : 'unknown error'}`,
      )
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Recent orders</h1>
          <Link to="/pos" className="text-sm text-slate-600 underline">
            Back to order screen
          </Link>
        </div>

        {reprintMessage && (
          <div className="flex items-center justify-between rounded bg-amber-100 px-4 py-2 text-sm text-amber-800">
            <span>{reprintMessage}</span>
            <button type="button" onClick={() => setReprintMessage(null)} className="underline">
              dismiss
            </button>
          </div>
        )}

        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {orders.map((order) => (
            <li key={order.id} className="flex items-center justify-between gap-3 px-3 py-2">
              <div>
                <p className="font-medium text-slate-800">
                  {order.order_no}{' '}
                  <span className={`rounded px-1.5 py-0.5 text-xs ${STATUS_STYLES[order.status]}`}>
                    {order.status}
                  </span>
                </p>
                <p className="text-xs text-slate-500">
                  {order.type === 'dine_in'
                    ? (tableNameById.get(order.table_id ?? '') ?? 'Table')
                    : 'Takeaway'}{' '}
                  &middot; {formatSenAsRM(order.total_sen)}
                </p>
              </div>
              <div className="flex shrink-0 gap-2">
                {order.status === 'open' && (
                  <button
                    type="button"
                    onClick={() => navigate('/pos', { state: { resumeOrderId: order.id } })}
                    className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
                  >
                    Resume
                  </button>
                )}
                {order.status === 'paid' && (
                  <button
                    type="button"
                    onClick={() => void handleReprint(order)}
                    className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-700"
                  >
                    Reprint
                  </button>
                )}
                {order.status !== 'void' && (
                  <button
                    type="button"
                    onClick={() => setVoidingOrder(order)}
                    className="rounded border border-red-300 px-3 py-2 text-sm text-red-600"
                  >
                    Void
                  </button>
                )}
              </div>
            </li>
          ))}
          {orders.length === 0 && (
            <li className="px-3 py-4 text-sm text-slate-500">No orders yet.</li>
          )}
        </ul>
      </div>

      {voidingOrder && (
        <VoidOrderModal
          order={voidingOrder}
          onCancel={() => setVoidingOrder(null)}
          onVoided={() => setVoidingOrder(null)}
        />
      )}
    </div>
  )
}
