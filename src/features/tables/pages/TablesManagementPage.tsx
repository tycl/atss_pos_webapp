import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { catchAsync } from '../../../lib/catchAsync'
import { getActiveMerchantId, getActiveOutletId } from '../../../lib/localSession'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import { useStaffSession } from '../../auth/useStaffSession'
import { ConfirmButton } from '../../menu/components/ConfirmButton'
import { createTable, deleteTable, listTables, updateTable } from '../api'

export function TablesManagementPage() {
  const { staff } = useStaffSession()
  const merchantId = getActiveMerchantId()
  const outletId = getActiveOutletId()
  const tables = useLiveQuery(
    () => (outletId ? listTables(outletId) : Promise.resolve([])),
    [outletId],
    [],
  )
  const [newName, setNewName] = useState('')
  const [error, setError] = useState<string | null>(null)

  if (!staff) return <Navigate to="/login" replace />
  if (staff.role !== 'owner') return <Navigate to="/pos" replace />
  if (!merchantId || !outletId) return <Navigate to="/onboarding" replace />

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setError(null)
    if (!newName.trim() || !merchantId || !outletId) return
    const maxSortOrder = tables.reduce((max, t) => Math.max(max, t.sort_order), -1)
    try {
      await createTable({ merchantId, outletId, name: newName.trim(), sortOrder: maxSortOrder + 1 })
      setNewName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add table')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Tables</h1>
          <Link to="/backoffice" className="text-sm text-slate-600 underline">
            Back
          </Link>
        </div>

        <form onSubmit={handleAdd} className="flex gap-2">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New table name, e.g. Table 1"
            className="flex-1 rounded border border-slate-300 px-3 py-2"
          />
          <button type="submit" className="rounded bg-slate-800 px-4 py-2 text-white">
            Add
          </button>
        </form>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {tables.map((table) => (
            <li key={table.id} className="flex items-center gap-3 px-3 py-2">
              <input
                defaultValue={table.name}
                onBlur={(e) => {
                  if (e.target.value.trim() && e.target.value !== table.name) {
                    catchAsync(updateTable(table.id, { name: e.target.value.trim() }), setError)
                  }
                }}
                className="flex-1 rounded border border-transparent px-2 py-2 hover:border-slate-300 focus:border-slate-300"
              />
              <ConfirmButton
                onConfirm={() => catchAsync(deleteTable(table.id), setError)}
                className="rounded border border-red-300 px-3 py-2 text-sm text-red-600"
              >
                Delete
              </ConfirmButton>
            </li>
          ))}
          {tables.length === 0 && (
            <li className="px-3 py-4 text-sm text-slate-500">No tables yet.</li>
          )}
        </ul>
      </div>
    </div>
  )
}
