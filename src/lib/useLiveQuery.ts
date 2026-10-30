import { liveQuery } from 'dexie'
import { useEffect, useState } from 'react'

/** Subscribes to a Dexie liveQuery and re-renders whenever the underlying data changes. */
export function useLiveQuery<T>(querier: () => Promise<T>, deps: unknown[], initial: T): T {
  const [value, setValue] = useState<T>(initial)

  useEffect(() => {
    const subscription = liveQuery(querier).subscribe({
      next: setValue,
      error: (err) => console.error('useLiveQuery error', err),
    })
    return () => subscription.unsubscribe()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)

  return value
}
