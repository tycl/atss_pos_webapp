import { Link, Navigate } from 'react-router-dom'
import { useStaffSession } from '../../features/auth/useStaffSession'

/** Staff management is built in a later phase. */
export function BackofficeHome() {
  const { staff } = useStaffSession()

  if (!staff) return <Navigate to="/login" replace />
  if (staff.role !== 'owner') return <Navigate to="/pos" replace />

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-50">
      <h1 className="text-2xl font-semibold text-slate-800">Back office</h1>
      <p className="text-slate-600">Welcome, {staff.name}.</p>
      <div className="flex gap-3">
        <Link to="/backoffice/menu" className="rounded bg-slate-800 px-4 py-2 text-white">
          Manage menu
        </Link>
        <Link to="/backoffice/tables" className="rounded bg-slate-800 px-4 py-2 text-white">
          Manage tables
        </Link>
        <Link to="/backoffice/settings" className="rounded bg-slate-800 px-4 py-2 text-white">
          Outlet settings
        </Link>
        <Link to="/reports/daily-sales" className="rounded bg-slate-800 px-4 py-2 text-white">
          Daily sales report
        </Link>
        <Link to="/backoffice/dashboard" className="rounded bg-slate-800 px-4 py-2 text-white">
          Dashboard
        </Link>
      </div>
    </div>
  )
}
