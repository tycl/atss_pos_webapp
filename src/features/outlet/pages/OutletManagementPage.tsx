import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { catchAsync } from '../../../lib/catchAsync'
import { getActiveMerchantId, getActiveOutletId } from '../../../lib/localSession'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import { useStaffSession } from '../../auth/useStaffSession'
import { createOutlet, listOutlets, updateOutlet } from '../api'

export function OutletManagementPage() {
  const { staff } = useStaffSession()
  const merchantId = getActiveMerchantId()
  const activeOutletId = getActiveOutletId()
  const outlets = useLiveQuery(
    () => (merchantId ? listOutlets(merchantId) : Promise.resolve([])),
    [merchantId],
    [],
  )

  const [newName, setNewName] = useState('')
  const [newAddress, setNewAddress] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  if (!staff) return <Navigate to="/login" replace />
  if (staff.role !== 'owner') return <Navigate to="/pos" replace />
  if (!merchantId) return <Navigate to="/onboarding" replace />

  async function handleAdd(event: FormEvent) {
    event.preventDefault()
    setError(null)
    setSuccess(null)
    if (!newName.trim() || !merchantId) return
    try {
      const outlet = await createOutlet({
        merchantId,
        name: newName.trim(),
        address: newAddress.trim() || undefined,
      })
      setNewName('')
      setNewAddress('')
      setSuccess(`"${outlet.name}" created. Switch to it using the outlet switcher.`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create outlet')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Outlets</h1>
          <Link to="/backoffice" className="text-sm text-slate-600 underline">
            Back
          </Link>
        </div>

        <form onSubmit={handleAdd} className="space-y-2 rounded border border-slate-200 bg-white p-4">
          <p className="text-sm font-medium text-slate-700">Add a new outlet</p>
          <div className="flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="Outlet name, e.g. Sunway Branch"
              className="flex-1 rounded border border-slate-300 px-3 py-2"
              required
            />
            <input
              value={newAddress}
              onChange={(e) => setNewAddress(e.target.value)}
              placeholder="Address (optional)"
              className="flex-1 rounded border border-slate-300 px-3 py-2"
            />
            <button type="submit" className="rounded bg-slate-800 px-4 py-2 text-white">
              Add
            </button>
          </div>
        </form>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {success && <p className="text-sm text-green-700">{success}</p>}

        <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
          {outlets.map((outlet) => (
            <OutletRow
              key={outlet.id}
              outlet={outlet}
              isActive={outlet.id === activeOutletId}
              onError={setError}
            />
          ))}
          {outlets.length === 0 && (
            <li className="px-3 py-4 text-sm text-slate-500">No outlets yet.</li>
          )}
        </ul>
      </div>
    </div>
  )
}

function OutletRow({
  outlet,
  isActive,
  onError,
}: {
  outlet: { id: string; name: string; address: string | null; receipt_footer: string | null }
  isActive: boolean
  onError: (msg: string | null) => void
}) {
  return (
    <li className="space-y-1 px-3 py-3">
      <div className="flex items-center gap-2">
        <input
          defaultValue={outlet.name}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== outlet.name) {
              catchAsync(updateOutlet(outlet.id, { name: e.target.value.trim() }), onError)
            }
          }}
          className="flex-1 rounded border border-transparent px-2 py-1 font-medium hover:border-slate-300 focus:border-slate-300"
        />
        {isActive && (
          <span className="rounded bg-primary-100 px-2 py-0.5 text-xs font-medium text-primary-700">
            Active
          </span>
        )}
      </div>
      <div className="flex gap-2 pl-2">
        <input
          defaultValue={outlet.address ?? ''}
          placeholder="Address"
          onBlur={(e) => {
            const newAddr = e.target.value.trim() || null
            if (newAddr !== (outlet.address ?? '')) {
              catchAsync(updateOutlet(outlet.id, { address: newAddr }), onError)
            }
          }}
          className="flex-1 rounded border border-transparent px-2 py-1 text-sm text-slate-600 hover:border-slate-300 focus:border-slate-300"
        />
        <input
          defaultValue={outlet.receipt_footer ?? ''}
          placeholder="Receipt footer"
          onBlur={(e) => {
            const newFooter = e.target.value.trim() || null
            if (newFooter !== (outlet.receipt_footer ?? '')) {
              catchAsync(updateOutlet(outlet.id, { receipt_footer: newFooter }), onError)
            }
          }}
          className="flex-1 rounded border border-transparent px-2 py-1 text-sm text-slate-600 hover:border-slate-300 focus:border-slate-300"
        />
      </div>
    </li>
  )
}
