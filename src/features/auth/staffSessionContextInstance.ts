import { createContext } from 'react'
import type { Staff } from '../../lib/types'

export interface StaffSessionValue {
  staff: Staff | null
  login: (staff: Staff) => void
  logout: () => void
}

export const StaffSessionContext = createContext<StaffSessionValue | null>(null)
