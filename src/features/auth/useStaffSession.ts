import { useContext } from 'react'
import { StaffSessionContext, type StaffSessionValue } from './staffSessionContextInstance'

export function useStaffSession(): StaffSessionValue {
  const ctx = useContext(StaffSessionContext)
  if (!ctx) throw new Error('useStaffSession must be used within a StaffSessionProvider')
  return ctx
}
