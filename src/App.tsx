import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { StaffSessionProvider } from './features/auth/StaffSessionContext'
import { isSyncDisabledForActiveMerchant } from './features/sync/queue'
import { SyncStatusIndicator } from './features/sync/SyncStatusIndicator'
import { startSyncManager, type SyncManager } from './features/sync/syncManager'
import { requestPersistentStorage } from './lib/persistentStorage'

function App() {
  useEffect(() => {
    let manager: SyncManager | null = null
    let cancelled = false

    // Basic-plan merchants are device-only — don't even start the poll loop.
    // A plan change takes effect on next load, which is fine: there's no
    // requirement to enforce it live mid-session.
    void isSyncDisabledForActiveMerchant().then((disabled) => {
      if (cancelled || disabled) return
      manager = startSyncManager()
    })

    return () => {
      cancelled = true
      manager?.stop()
    }
  }, [])

  useEffect(() => {
    void requestPersistentStorage()
  }, [])

  return (
    <StaffSessionProvider>
      <RouterProvider router={router} />
      <SyncStatusIndicator />
    </StaffSessionProvider>
  )
}

export default App
