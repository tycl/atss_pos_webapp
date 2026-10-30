import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { LoadingState } from '../../../components/LoadingState'
import { parseLocalDateInputValue, toLocalDateInputValue } from '../../../lib/date'
import { getActiveOutletId } from '../../../lib/localSession'
import { formatSenAsRM } from '../../../lib/money'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import { useStaffSession } from '../../auth/useStaffSession'
import { buildDailySalesReport } from '../api'

const PAYMENT_METHOD_LABELS: Record<string, string> = {
  cash: 'Cash',
  duitnow_qr: 'DuitNow QR',
}

export function DailySalesReportPage() {
  const { staff } = useStaffSession()
  const outletId = getActiveOutletId()
  const [dateInput, setDateInput] = useState(() => toLocalDateInputValue(new Date()))

  const report = useLiveQuery(
    () =>
      outletId
        ? buildDailySalesReport(outletId, parseLocalDateInputValue(dateInput))
        : Promise.resolve(undefined),
    [outletId, dateInput],
    undefined,
  )

  if (!staff) return <Navigate to="/login" replace />
  if (staff.role !== 'owner' && staff.role !== 'manager') return <Navigate to="/pos" replace />
  if (!outletId) return <Navigate to="/onboarding" replace />
  if (!report) return <LoadingState />

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-2xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Daily sales report</h1>
          <Link to="/pos" className="text-sm text-slate-600 underline">
            Back to order screen
          </Link>
        </div>

        <label className="block text-sm font-medium text-slate-700">
          Date
          <input
            type="date"
            value={dateInput}
            onChange={(e) => setDateInput(e.target.value)}
            className="mt-1 rounded border border-slate-300 px-3 py-2"
          />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-white p-3 shadow">
            <p className="text-xs text-slate-500">Total sales</p>
            <p className="text-lg font-semibold text-slate-800">
              {formatSenAsRM(report.totalSalesSen)}
            </p>
          </div>
          <div className="rounded-lg bg-white p-3 shadow">
            <p className="text-xs text-slate-500">Paid orders</p>
            <p className="text-lg font-semibold text-slate-800">{report.paidOrderCount}</p>
          </div>
          <div className="rounded-lg bg-white p-3 shadow">
            <p className="text-xs text-slate-500">Voids</p>
            <p className="text-lg font-semibold text-slate-800">
              {report.voidCount} ({formatSenAsRM(report.voidTotalSen)})
            </p>
          </div>
        </div>

        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">By payment method</h2>
          {report.salesByMethod.length === 0 ? (
            <p className="text-sm text-slate-500">No sales.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {report.salesByMethod.map((row) => (
                  <tr key={row.method} className="border-t border-slate-100">
                    <td className="py-1 text-slate-700">
                      {PAYMENT_METHOD_LABELS[row.method] ?? row.method}
                    </td>
                    <td className="py-1 text-right text-slate-500">{row.count}</td>
                    <td className="py-1 text-right font-medium text-slate-800">
                      {formatSenAsRM(row.totalSen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">By item</h2>
          {report.salesByItem.length === 0 ? (
            <p className="text-sm text-slate-500">No sales.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {report.salesByItem.map((row) => (
                  <tr key={row.itemId} className="border-t border-slate-100">
                    <td className="py-1 text-slate-700">{row.name}</td>
                    <td className="py-1 text-right text-slate-500">&times;{row.qty}</td>
                    <td className="py-1 text-right font-medium text-slate-800">
                      {formatSenAsRM(row.totalSen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">By category</h2>
          {report.salesByCategory.length === 0 ? (
            <p className="text-sm text-slate-500">No sales.</p>
          ) : (
            <table className="w-full text-sm">
              <tbody>
                {report.salesByCategory.map((row) => (
                  <tr key={row.categoryId ?? 'uncategorized'} className="border-t border-slate-100">
                    <td className="py-1 text-slate-700">{row.name}</td>
                    <td className="py-1 text-right font-medium text-slate-800">
                      {formatSenAsRM(row.totalSen)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="rounded-lg bg-white p-4 shadow">
          <h2 className="mb-2 text-sm font-semibold text-slate-700">
            Tax &amp; service charge collected
          </h2>
          <div className="flex justify-between text-sm text-slate-700">
            <span>SST</span>
            <span>{formatSenAsRM(report.sstCollectedSen)}</span>
          </div>
          <div className="flex justify-between text-sm text-slate-700">
            <span>Service charge</span>
            <span>{formatSenAsRM(report.serviceChargeCollectedSen)}</span>
          </div>
        </div>
      </div>
    </div>
  )
}
