import { useEffect, useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Button } from '../../../components/Button'
import { Modal } from '../../../components/Modal'
import { catchAsync } from '../../../lib/catchAsync'
import { getActiveMerchantId, getActiveOutletId } from '../../../lib/localSession'
import type { Device } from '../../../lib/types'
import { useStaffSession } from '../../auth/useStaffSession'
import { ConfirmButton } from '../../menu/components/ConfirmButton'
import {
  listTillsForOutlet,
  renameTill,
  requestForceReclaim,
  setTillActive,
} from '../backofficeApi'
import { formatLastSeen } from '../formatLastSeen'
import { generatePairingCode } from '../pairingCodes'

export function TillsManagementPage() {
  const { staff } = useStaffSession()
  const merchantId = getActiveMerchantId()
  const outletId = getActiveOutletId()

  const [tills, setTills] = useState<Device[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!outletId) return
    void listTillsForOutlet(outletId)
      .then(setTills)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load tills'))
  }, [outletId])

  function updateRow(id: string, patch: Partial<Device>) {
    setTills((rows) => rows?.map((row) => (row.id === id ? { ...row, ...patch } : row)) ?? rows)
  }

  if (!staff) return <Navigate to="/login" replace />
  if (staff.role !== 'owner') return <Navigate to="/pos" replace />
  if (!merchantId || !outletId) return <Navigate to="/onboarding" replace />

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Tills</h1>
          <Link to="/backoffice" className="text-sm text-slate-600 underline">
            Back
          </Link>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {tills === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

        {tills && tills.length === 0 && (
          <p className="rounded border border-slate-200 bg-white px-3 py-4 text-sm text-slate-500">
            No tills yet — one is created automatically the first time the POS screen is opened.
          </p>
        )}

        {tills && tills.length > 0 && (
          <ul className="divide-y divide-slate-200 rounded border border-slate-200 bg-white">
            {tills.map((till) => (
              <TillRow
                key={till.id}
                till={till}
                merchantId={merchantId}
                outletId={outletId}
                onUpdate={updateRow}
              />
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TillRow({
  till,
  merchantId,
  outletId,
  onUpdate,
}: {
  till: Device
  merchantId: string
  outletId: string
  onUpdate: (id: string, patch: Partial<Device>) => void
}) {
  const [rowError, setRowError] = useState<string | null>(null)
  const [reclaiming, setReclaiming] = useState(false)
  const [generatingCode, setGeneratingCode] = useState(false)
  const [pairingCode, setPairingCode] = useState<{ code: string; expiresAt: string } | null>(null)

  function handleReclaim() {
    setRowError(null)
    setReclaiming(true)
    catchAsync(
      requestForceReclaim(till.id).then((saved) => {
        onUpdate(till.id, saved)
        setReclaiming(false)
      }),
      (message) => {
        setRowError(message)
        setReclaiming(false)
      },
    )
  }

  function handleGenerateCode() {
    setRowError(null)
    setGeneratingCode(true)
    generatePairingCode(merchantId, outletId, till.id)
      .then((result) => {
        setPairingCode(result)
        setGeneratingCode(false)
      })
      .catch((err) => {
        setRowError(err instanceof Error ? err.message : 'Could not generate a pairing code')
        setGeneratingCode(false)
      })
  }

  return (
    <li className="px-3 py-2">
      <div className="flex flex-wrap items-center gap-3">
        <input
          defaultValue={till.label}
          onBlur={(e) => {
            if (e.target.value.trim() && e.target.value !== till.label) {
              catchAsync(
                renameTill(till.id, e.target.value).then((saved) => onUpdate(till.id, saved)),
                setRowError,
              )
            }
          }}
          className="min-w-[8rem] flex-1 rounded border border-transparent px-2 py-2 hover:border-slate-300 focus:border-slate-300"
        />
        <span className="text-sm text-slate-500">{till.receipt_prefix}</span>
        <span className="text-xs text-slate-400">{formatLastSeen(till.last_seen_at ?? null)}</span>
        <span
          className="max-w-[10rem] truncate text-xs text-slate-400"
          title={till.user_agent ?? undefined}
        >
          {till.user_agent ?? '—'}
        </span>
        <span
          className={
            till.active
              ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
              : 'rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600'
          }
        >
          {till.active ? 'Active' : 'Inactive'}
        </span>
        <label className="flex items-center gap-1 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={till.active}
            onChange={(e) =>
              catchAsync(
                setTillActive(till.id, e.target.checked).then((saved) => onUpdate(till.id, saved)),
                setRowError,
              )
            }
          />
          Active
        </label>
        <ConfirmButton
          onConfirm={handleReclaim}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600"
        >
          {reclaiming ? 'Requesting…' : 'Force re-claim'}
        </ConfirmButton>
        <button
          type="button"
          disabled={generatingCode}
          onClick={handleGenerateCode}
          className="rounded border border-slate-300 px-3 py-2 text-sm text-slate-600 disabled:opacity-60"
        >
          {generatingCode ? 'Generating…' : 'Generate pairing code'}
        </button>
      </div>
      {rowError && <p className="mt-1 text-sm text-red-600">{rowError}</p>}

      {pairingCode && (
        <Modal title="Pairing code">
          <p className="mb-4 text-sm text-slate-600">
            Read this code to whoever is setting up the new browser for &ldquo;{till.label}
            &rdquo;. It can only be used once, and expires at{' '}
            {new Date(pairingCode.expiresAt).toLocaleTimeString()}.
          </p>
          <p className="mb-4 text-center text-3xl font-semibold tracking-widest text-slate-800">
            {pairingCode.code}
          </p>
          <Button variant="outline" size="md" fullWidth onClick={() => setPairingCode(null)}>
            Done
          </Button>
        </Modal>
      )}
    </li>
  )
}
