import { useEffect, useState, type ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { isCurrentUserPlatformAdmin } from '../../features/platform-admin/api'

/**
 * This codebase's first route-level gate — kept deliberately minimal (one
 * async check, no layout/outlet machinery) since there's only ever one
 * platform-admin account to check against.
 */
export function RequirePlatformAdmin({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<'checking' | 'allowed' | 'denied'>('checking')

  useEffect(() => {
    let cancelled = false
    void isCurrentUserPlatformAdmin()
      .then((isAdmin) => {
        if (!cancelled) setStatus(isAdmin ? 'allowed' : 'denied')
      })
      .catch(() => {
        if (!cancelled) setStatus('denied')
      })
    return () => {
      cancelled = true
    }
  }, [])

  if (status === 'checking') return null
  if (status === 'denied') return <Navigate to="/platform-admin/signin" replace />
  return <>{children}</>
}
