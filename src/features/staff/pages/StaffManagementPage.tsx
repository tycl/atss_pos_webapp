import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { catchAsync } from '../../../lib/catchAsync'
import { getActiveMerchantId } from '../../../lib/localSession'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import type { Staff, StaffRole } from '../../../lib/types'
import { useStaffSession } from '../../auth/useStaffSession'
import { ConfirmButton } from '../../menu/components/ConfirmButton'
import {
  createStaff,
  listStaff,
  renameStaff,
  resetStaffPin,
  setStaffActive,
  updateStaffRole,
} from '../api'

const ROLES: StaffRole[] = ['owner', 'manager', 'cashier']

export function StaffManagementPage() {
  const { staff: currentStaff } = useStaffSession()
  const merchantId = getActiveMerchantId()
  const staffList = useLiveQuery(
    () => (merchantId ? listStaff(merchantId) : Promise.resolve([])),
    [merchantId],
    [],
  )

  const [name, setName] = useState('')
  const [role, setRole] = useState<StaffRole>('cashier')
  const [pin, setPin] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!currentStaff) return <Navigate to="/login" replace />
  if (currentStaff.role !== 'owner') return <Navigate to="/pos" replace />
  if (!merchantId) return <Navigate to="/onboarding" replace />

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setError(null)
    try {
      await createStaff({ merchantId: merchantId!, name, role, pin })
      setName('')
      setRole('cashier')
      setPin('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add staff member')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Staff</h1>
          <Link to="/backoffice" className="text-sm text-slate-600 underline">
            Back
          </Link>
        </div>

        <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col text-sm text-slate-700">
            Name
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <label className="flex flex-col text-sm text-slate-700">
            Role
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as StaffRole)}
              className="rounded border border-slate-300 px-3 py-2"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {r}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col text-sm text-slate-700">
            PIN (4–6 digits)
            <input
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              inputMode="numeric"
              className="w-32 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded bg-slate-800 px-4 py-2 text-white">
            Add staff
          </button>
        </form>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {staffList.map((member) => (
            <StaffRow key={member.id} staff={member} currentStaffId={currentStaff.id} />
          ))}
          {staffList.length === 0 && (
            <li className="px-3 py-4 text-sm text-slate-500">No staff yet.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

function StaffRow({ staff, currentStaffId }: { staff: Staff; currentStaffId: string }) {
  const [rowError, setRowError] = useState<string | null>(null)
  const [resettingPin, setResettingPin] = useState(false)
  const [newPin, setNewPin] = useState('')

  function handleResetPin(event: FormEvent) {
    event.preventDefault()
    setRowError(null)
    catchAsync(
      resetStaffPin(staff.id, newPin, currentStaffId).then(() => {
        setResettingPin(false)
        setNewPin('')
      }),
      setRowError,
    )
  }

  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          defaultValue={staff.name}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== staff.name) {
              catchAsync(renameStaff(staff.id, e.target.value), setRowError)
            }
          }}
          className="flex-1 rounded border border-transparent px-2 py-2 hover:border-slate-300 focus:border-slate-300"
        />
        <select
          value={staff.role}
          onChange={(e) =>
            catchAsync(updateStaffRole(staff.id, e.target.value as StaffRole), setRowError)
          }
          className="rounded border border-slate-300 px-2 py-2 text-sm"
        >
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={staff.active}
            onChange={(e) => catchAsync(setStaffActive(staff.id, e.target.checked), setRowError)}
          />
          Active
        </label>
        <ConfirmButton
          onConfirm={() => setResettingPin(true)}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
        >
          Reset PIN
        </ConfirmButton>
      </div>

      {rowError && <p className="mt-1 text-sm text-red-600">{rowError}</p>}

      {resettingPin && (
        <form
          onSubmit={handleResetPin}
          className="mt-2 flex items-end gap-2 border-t border-slate-100 pt-2"
        >
          <label className="flex flex-col text-sm text-slate-700">
            New PIN (4–6 digits)
            <input
              value={newPin}
              onChange={(e) => setNewPin(e.target.value)}
              inputMode="numeric"
              autoFocus
              className="w-32 rounded border border-slate-300 px-3 py-2"
            />
          </label>
          <button type="submit" className="rounded bg-slate-800 px-4 py-2 text-sm text-white">
            Save
          </button>
          <button
            type="button"
            onClick={() => {
              setResettingPin(false)
              setNewPin('')
            }}
            className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
          >
            Cancel
          </button>
        </form>
      )}
    </li>
  )
}
