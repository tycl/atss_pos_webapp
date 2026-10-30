import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { downloadCsv, toCsv } from '../../../lib/csv'
import { parseLocalDateInputValue, toLocalDateInputValue } from '../../../lib/date'
import { getActiveOutletId } from '../../../lib/localSession'
import { formatSenAsRM } from '../../../lib/money'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import { useStaffSession } from '../../auth/useStaffSession'
import { buildSalesByDayReport, buildTopItemsReport } from '../api'

function defaultStart(): Date {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return d
}

/** "20261024" (the compact order-number format) -> "2026-10-24" for display. */
function formatDateLabel(dateLabel: string): string {
  return `${dateLabel.slice(0, 4)}-${dateLabel.slice(4, 6)}-${dateLabel.slice(6, 8)}`
}

export function OwnerDashboardPage() {
  const { staff } = useStaffSession()
  const outletId = getActiveOutletId()

  const [startInput, setStartInput] = useState(() => toLocalDateInputValue(defaultStart()))
  const [endInput, setEndInput] = useState(() => toLocalDateInputValue(new Date()))

  const start = parseLocalDateInputValue(startInput)
  const end = parseLocalDateInputValue(endInput)

  const salesByDay = useLiveQuery(
    () => (outletId ? buildSalesByDayReport(outletId, start, end) : Promise.resolve([])),
    [outletId, startInput, endInput],
    [],
  )
  const topItems = useLiveQuery(
    () => (outletId ? buildTopItemsReport(outletId, start, end) : Promise.resolve([])),
    [outletId, startInput, endInput],
    [],
  )

  if (!staff) return <Navigate to="/login" replace />
  if (staff.role !== 'owner') return <Navigate to="/pos" replace />
  if (!outletId) return <Navigate to="/onboarding" replace />

  const maxDaySen = Math.max(1, ...salesByDay.map((d) => d.totalSen))
  const maxItemSen = Math.max(1, ...topItems.map((i) => i.totalSen))
  const showDayLabels = salesByDay.length <= 14

  function exportSalesByDay() {
    const csv = toCsv(salesByDay, [
      { key: 'dateLabel', label: 'Date' },
      { key: 'orderCount', label: 'Orders' },
      { key: 'cashSen', label: 'Cash (sen)' },
      { key: 'qrSen', label: 'DuitNow QR (sen)' },
      { key: 'totalSen', label: 'Total (sen)' },
    ])
    downloadCsv(`sales-by-day-${startInput}-to-${endInput}.csv`, csv)
  }

  function exportTopItems() {
    const csv = toCsv(topItems, [
      { key: 'name', label: 'Item' },
      { key: 'qty', label: 'Qty sold' },
      { key: 'totalSen', label: 'Total (sen)' },
    ])
    downloadCsv(`top-items-${startInput}-to-${endInput}.csv`, csv)
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Dashboard</h1>
          <Link to="/backoffice" className="text-sm text-slate-600 underline">
            Back
          </Link>
        </div>

        <div className="flex gap-3">
          <label className="text-sm font-medium text-slate-700">
            From
            <input
              type="date"
              value={startInput}
              onChange={(e) => setStartInput(e.target.value)}
              className="mt-1 block rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="text-sm font-medium text-slate-700">
            To
            <input
              type="date"
              value={endInput}
              onChange={(e) => setEndInput(e.target.value)}
              className="mt-1 block rounded border border-slate-300 px-3 py-2"
            />
          </label>
        </div>

        <div className="rounded-lg bg-white p-4 shadow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Sales by day</h2>
            <button
              type="button"
              onClick={exportSalesByDay}
              className="text-xs text-slate-600 underline"
            >
              Export CSV
            </button>
          </div>

          {salesByDay.length === 0 ? (
            <p className="text-sm text-slate-500">No data.</p>
          ) : (
            <>
              <div className="mb-3 flex h-32 gap-1">
                {salesByDay.map((day) => (
                  <div
                    key={day.dateLabel}
                    className="flex h-full flex-1 flex-col items-center justify-end gap-1"
                  >
                    {showDayLabels && day.totalSen > 0 && (
                      <span className="text-[10px] text-slate-500">
                        {formatSenAsRM(day.totalSen)}
                      </span>
                    )}
                    <div
                      className="w-full rounded-t bg-slate-800"
                      style={{ height: `${Math.max(2, (day.totalSen / maxDaySen) * 100)}%` }}
                      title={`${formatDateLabel(day.dateLabel)}: ${formatSenAsRM(day.totalSen)}`}
                    />
                  </div>
                ))}
              </div>

              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-slate-500">
                    <th className="font-normal">Date</th>
                    <th className="font-normal">Orders</th>
                    <th className="text-right font-normal">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {salesByDay.map((day) => (
                    <tr key={day.dateLabel} className="border-t border-slate-100">
                      <td className="py-1 text-slate-700">{formatDateLabel(day.dateLabel)}</td>
                      <td className="py-1 text-slate-500">{day.orderCount}</td>
                      <td className="py-1 text-right font-medium text-slate-800">
                        {formatSenAsRM(day.totalSen)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}
        </div>

        <div className="rounded-lg bg-white p-4 shadow">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-700">Top items</h2>
            <button
              type="button"
              onClick={exportTopItems}
              className="text-xs text-slate-600 underline"
            >
              Export CSV
            </button>
          </div>

          {topItems.length === 0 ? (
            <p className="text-sm text-slate-500">No data.</p>
          ) : (
            <ul className="space-y-2">
              {topItems.map((item) => (
                <li key={item.itemId}>
                  <div className="mb-0.5 flex justify-between text-sm">
                    <span className="text-slate-700">{item.name}</span>
                    <span className="text-slate-800">
                      {formatSenAsRM(item.totalSen)} &middot; &times;{item.qty}
                    </span>
                  </div>
                  <div className="h-2 rounded bg-slate-100">
                    <div
                      className="h-2 rounded bg-slate-800"
                      style={{ width: `${Math.max(2, (item.totalSen / maxItemSen) * 100)}%` }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  )
}
