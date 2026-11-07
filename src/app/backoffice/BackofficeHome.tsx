import { useEffect } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { db } from '../../lib/db'
import { getActiveOutletId } from '../../lib/localSession'
import { formatSenAsRM } from '../../lib/money'
import { useLiveQuery } from '../../lib/useLiveQuery'
import { useStaffSession } from '../../features/auth/useStaffSession'
import { listOpenOrders } from '../../features/ordering/orderApi'
import { buildDailySalesReport } from '../../features/reports/api'
import { pullOrdersForDate } from '../../features/sync/pullOrdersForDate'
import { useOnlineStatus } from '../../features/sync/useOnlineStatus'

const NAV_LINKS = [
  { to: '/backoffice/menu', label: 'Menu', description: 'Categories, items, modifiers' },
  { to: '/backoffice/tables', label: 'Tables', description: 'Dine-in table layout' },
  { to: '/backoffice/staff', label: 'Staff', description: 'Roles, PINs, access' },
  { to: '/backoffice/tills', label: 'Tills', description: 'Rename, deactivate, re-claim' },
  {
    to: '/backoffice/settings',
    label: 'Outlet settings',
    description: 'Tax, service charge, printing',
  },
  { to: '/reports/daily-sales', label: 'Daily sales report', description: "Today's Z report" },
  {
    to: '/backoffice/dashboard',
    label: 'Dashboard',
    description: 'Sales by day, top items, CSV export',
  },
  {
    to: '/backoffice/sync-issues',
    label: 'Sync issues',
    description: 'Records stuck syncing, and why',
  },
]

export function BackofficeHome() {
  const { staff, logout } = useStaffSession()
  const outletId = getActiveOutletId()
  const isOnline = useOnlineStatus()

  // Same reasoning as DailySalesReportPage: this device's Dexie only has
  // orders it took itself, so pull today's orders down from other devices
  // before showing "today's sales".
  useEffect(() => {
    if (!outletId || !isOnline) return
    pullOrdersForDate(outletId, new Date()).catch((err) => {
      console.error('backoffice home: could not pull today’s orders from the cloud', err)
    })
  }, [outletId, isOnline])

  const outlet = useLiveQuery(
    () => (outletId ? db.outlets.get(outletId).then((o) => o ?? null) : Promise.resolve(null)),
    [outletId],
    null,
  )
  const today = useLiveQuery(
    () => (outletId ? buildDailySalesReport(outletId, new Date()) : Promise.resolve(null)),
    [outletId],
    null,
  )
  const openOrderCount = useLiveQuery(
    () =>
      outletId ? listOpenOrders(outletId).then((orders) => orders.length) : Promise.resolve(0),
    [outletId],
    0,
  )

  if (!staff) return <Navigate to="/login" replace />
  if (staff.role !== 'owner') return <Navigate to="/pos" replace />

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">
              {outlet?.name ?? 'Back office'}
            </h1>
            <p className="text-sm text-slate-500">Welcome, {staff.name}.</p>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <Link to="/pos" className="text-slate-600 underline">
              Go to POS
            </Link>
            <button type="button" onClick={logout} className="text-slate-600 underline">
              Log out
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-lg bg-white p-4 shadow">
            <p className="text-xs text-slate-500">Today's sales</p>
            <p className="text-lg font-semibold text-slate-800">
              {today ? formatSenAsRM(today.totalSalesSen) : '—'}
            </p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow">
            <p className="text-xs text-slate-500">Paid orders today</p>
            <p className="text-lg font-semibold text-slate-800">{today?.paidOrderCount ?? '—'}</p>
          </div>
          <div className="rounded-lg bg-white p-4 shadow">
            <p className="text-xs text-slate-500">Open orders</p>
            <p className="text-lg font-semibold text-slate-800">{openOrderCount}</p>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.to}
              to={link.to}
              className="rounded-lg bg-white p-4 shadow transition hover:shadow-md"
            >
              <p className="font-semibold text-slate-800">{link.label}</p>
              <p className="mt-1 text-xs text-slate-500">{link.description}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  )
}
