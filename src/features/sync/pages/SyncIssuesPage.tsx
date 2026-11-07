import { Link, Navigate } from 'react-router-dom'
import { db } from '../../../lib/db'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import type { SyncQueueItem } from '../../../lib/types'
import { useStaffSession } from '../../auth/useStaffSession'
import { isStuck } from '../syncIssueStatus'

function StatusPill({ item }: { item: SyncQueueItem }) {
  if (item.attempts === 0) {
    return (
      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600">
        Waiting
      </span>
    )
  }
  if (isStuck(item)) {
    return (
      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
        Stuck
      </span>
    )
  }
  return (
    <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-700">
      Retrying
    </span>
  )
}

/**
 * CLAUDE.md section 8: records in the sync queue are never dropped, by this
 * page or anything else — it's deliberately view-only, so an owner can see
 * what's stuck and why (e.g. leftover data from an abandoned test merchant,
 * see queue.ts's classifyError) without the app ever silently discarding
 * something unsynced. Local-only data: reads straight from this browser's
 * own Dexie sync_queue, same as SyncStatusIndicator's pending count.
 */
export function SyncIssuesPage() {
  const { staff } = useStaffSession()
  const items = useLiveQuery(
    () => db.sync_queue.orderBy('seq').reverse().toArray(),
    [],
    [] as SyncQueueItem[],
  )

  if (!staff) return <Navigate to="/login" replace />
  if (staff.role !== 'owner') return <Navigate to="/pos" replace />

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Sync issues</h1>
          <Link to="/backoffice" className="text-sm text-slate-600 underline">
            Back
          </Link>
        </div>

        <p className="text-sm text-slate-500">
          Records this device hasn't synced to the cloud yet. Nothing here is ever deleted
          automatically.
        </p>

        {items.length === 0 ? (
          <p className="rounded border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
            Nothing waiting to sync.
          </p>
        ) : (
          <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
            {items.map((item) => (
              <li key={item.id} className="px-3 py-2">
                <div className="flex flex-wrap items-center gap-3">
                  <span className="font-medium text-slate-800">{item.table}</span>
                  <span className="text-xs text-slate-500">{item.op}</span>
                  <span className="text-xs text-slate-500">
                    {new Date(item.created_at).toLocaleString()}
                  </span>
                  <span className="text-xs text-slate-500">
                    {item.attempts} attempt{item.attempts === 1 ? '' : 's'}
                  </span>
                  <StatusPill item={item} />
                </div>
                {item.last_error && <p className="mt-1 text-sm text-red-600">{item.last_error}</p>}
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}
