import { useEffect } from 'react'
import { RouterProvider } from 'react-router-dom'
import { router } from './app/router'
import { StaffSessionProvider } from './features/auth/StaffSessionContext'
import { SyncStatusIndicator } from './features/sync/SyncStatusIndicator'
import { startSyncManager } from './features/sync/syncManager'

function App() {
  useEffect(() => {
    const manager = startSyncManager()
    return manager.stop
  }, [])

  return (
    <StaffSessionProvider>
      <RouterProvider router={router} />
      <SyncStatusIndicator />
    </StaffSessionProvider>
  )
}

export default App
