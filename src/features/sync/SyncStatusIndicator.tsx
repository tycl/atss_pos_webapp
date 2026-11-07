import { Link } from 'react-router-dom'
import { db } from '../../lib/db'
import { getActiveMerchantId } from '../../lib/localSession'
import { useLiveQuery } from '../../lib/useLiveQuery'
import { useOnlineStatus } from './useOnlineStatus'

/** CLAUDE.md section 8: "Show a clear online/offline indicator and 'X records waiting to sync'." */
export function SyncStatusIndicator() {
  const online = useOnlineStatus()
  const pending = useLiveQuery(() => db.sync_queue.count(), [], 0)
  const plan = useLiveQuery(
    () => {
      const merchantId = getActiveMerchantId()
      return merchantId
        ? db.merchants.get(merchantId).then((m) => m?.plan ?? null)
        : Promise.resolve(null)
    },
    [],
    null,
  )

  if (plan === 'basic') {
    return (
      <div className="fixed bottom-3 right-3 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow">
        <span className="h-2 w-2 rounded-full bg-slate-400" aria-hidden="true" />
        <span>Basic plan · sync disabled</span>
      </div>
    )
  }

  return (
    <div className="fixed bottom-3 right-3 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow">
      <span
        className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
        aria-hidden="true"
      />
      <span>{online ? 'Online' : 'Offline'}</span>
      {pending > 0 && (
        <Link to="/backoffice/sync-issues" className="text-slate-500 underline">
          · {pending} record{pending === 1 ? '' : 's'} waiting to sync
        </Link>
      )}
    </div>
  )
}
