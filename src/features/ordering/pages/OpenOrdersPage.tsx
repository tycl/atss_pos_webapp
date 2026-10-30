import { useState } from 'react'
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom'
import { formatSenAsRM } from '../../../lib/money'
import { getActiveOutletId } from '../../../lib/localSession'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import { useStaffSession } from '../../auth/useStaffSession'
import { listTables } from '../../tables/api'
import { listOpenOrders } from '../orderApi'

interface OpenOrdersLocationState {
  printWarning?: string
}

export function OpenOrdersPage() {
  const { staff } = useStaffSession()
  const navigate = useNavigate()
  const location = useLocation()
  const outletId = getActiveOutletId()
  const [printWarning, setPrintWarning] = useState(
    (location.state as OpenOrdersLocationState | null)?.printWarning ?? null,
  )

  const tables = useLiveQuery(
    () => (outletId ? listTables(outletId) : Promise.resolve([])),
    [outletId],
    [],
  )
  const openOrders = useLiveQuery(
    () => (outletId ? listOpenOrders(outletId) : Promise.resolve([])),
    [outletId],
    [],
  )

  if (!staff) return <Navigate to="/login" replace />
  if (!outletId) return <Navigate to="/onboarding" replace />

  const openOrderByTableId = new Map(
    openOrders.filter((o) => o.table_id !== null).map((o) => [o.table_id as string, o]),
  )
  const takeawayOrders = openOrders.filter((o) => o.type === 'takeaway')

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Open tables &amp; orders</h1>
          <Link to="/pos" className="text-sm text-slate-600 underline">
            Back to order screen
          </Link>
        </div>

        {printWarning && (
          <div className="flex items-center justify-between rounded bg-amber-100 px-4 py-2 text-sm text-amber-800">
            <span>{printWarning}</span>
            <button type="button" onClick={() => setPrintWarning(null)} className="underline">
              dismiss
            </button>
          </div>
        )}

        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-700">Tables</h2>
          {tables.length === 0 ? (
            <p className="text-sm text-slate-500">No tables set up yet.</p>
          ) : (
            <div className="grid grid-cols-3 gap-3 sm:grid-cols-4">
              {tables.map((table) => {
                const order = openOrderByTableId.get(table.id)
                return (
                  <div
                    key={table.id}
                    className={`rounded-lg border p-3 ${
                      order ? 'border-amber-300 bg-amber-50' : 'border-slate-200 bg-white'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() =>
                        order
                          ? navigate('/pos', { state: { resumeOrderId: order.id } })
                          : navigate('/pos', { state: { newOrderTableId: table.id } })
                      }
                      className="block w-full text-left"
                    >
                      <p className="font-medium text-slate-800">{table.name}</p>
                      <p className="text-xs text-slate-500">
                        {order ? `${formatSenAsRM(order.total_sen)} · open` : 'Free'}
                      </p>
                    </button>
                    {order && (
                      <button
                        type="button"
                        onClick={() => navigate(`/pos/pay/${order.id}`)}
                        className="mt-2 w-full rounded bg-slate-800 py-2 text-sm text-white"
                      >
                        Pay
                      </button>
                    )}
                  </div>
                )
              })}
            </div>
          )}
        </section>

        <section>
          <h2 className="mb-2 text-sm font-medium text-slate-700">Open takeaway orders</h2>
          {takeawayOrders.length === 0 ? (
            <p className="text-sm text-slate-500">No open takeaway orders.</p>
          ) : (
            <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
              {takeawayOrders.map((order) => (
                <li key={order.id} className="flex items-center justify-between px-3 py-2">
                  <button
                    type="button"
                    onClick={() => navigate('/pos', { state: { resumeOrderId: order.id } })}
                    className="px-1 py-2 text-left hover:underline"
                  >
                    <span className="text-slate-800">{order.order_no}</span>
                    <span className="ml-2 text-sm text-slate-500">
                      {formatSenAsRM(order.total_sen)}
                    </span>
                  </button>
                  <button
                    type="button"
                    onClick={() => navigate(`/pos/pay/${order.id}`)}
                    className="rounded bg-slate-800 px-4 py-2 text-sm text-white"
                  >
                    Pay
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  )
}
