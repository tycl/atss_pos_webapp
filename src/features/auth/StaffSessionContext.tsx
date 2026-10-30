import { useMemo, useState, type ReactNode } from 'react'
import type { Staff } from '../../lib/types'
import { StaffSessionContext, type StaffSessionValue } from './staffSessionContextInstance'

const SESSION_KEY = 'atss-pos:staff-session'

function readStoredStaff(): Staff | null {
  try {
    const raw = sessionStorage.getItem(SESSION_KEY)
    return raw ? (JSON.parse(raw) as Staff) : null
  } catch {
    return null
  }
}

export function StaffSessionProvider({ children }: { children: ReactNode }) {
  const [staff, setStaff] = useState<Staff | null>(() => readStoredStaff())

  const value = useMemo<StaffSessionValue>(
    () => ({
      staff,
      login: (nextStaff) => {
        setStaff(nextStaff)
        sessionStorage.setItem(SESSION_KEY, JSON.stringify(nextStaff))
      },
      logout: () => {
        setStaff(null)
        sessionStorage.removeItem(SESSION_KEY)
      },
    }),
    [staff],
  )

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>
}
