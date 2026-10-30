import { db } from '../../lib/db'
import { useLiveQuery } from '../../lib/useLiveQuery'
import { useOnlineStatus } from './useOnlineStatus'

/** CLAUDE.md section 8: "Show a clear online/offline indicator and 'X records waiting to sync'." */
export function SyncStatusIndicator() {
  const online = useOnlineStatus()
  const pending = useLiveQuery(() => db.sync_queue.count(), [], 0)

  return (
    <div className="fixed bottom-3 right-3 flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-medium text-slate-700 shadow">
      <span
        className={`h-2 w-2 rounded-full ${online ? 'bg-green-500' : 'bg-red-500'}`}
        aria-hidden="true"
      />
      <span>{online ? 'Online' : 'Offline'}</span>
      {pending > 0 && (
        <span className="text-slate-500">
          · {pending} record{pending === 1 ? '' : 's'} waiting to sync
        </span>
      )}
    </div>
  )
}
