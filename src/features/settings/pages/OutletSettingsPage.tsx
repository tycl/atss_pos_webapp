import { useState, type FormEvent } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { LoadingState } from '../../../components/LoadingState'
import { getActiveOutletId } from '../../../lib/localSession'
import { percentStringToBp } from '../../../lib/money'
import { useLiveQuery } from '../../../lib/useLiveQuery'
import { useStaffSession } from '../../auth/useStaffSession'
import { getSettings, updateSettings } from '../api'

function bpToPercentString(bp: number): string {
  return (bp / 100).toString()
}

export function OutletSettingsPage() {
  const { staff } = useStaffSession()
  const outletId = getActiveOutletId()
  const settings = useLiveQuery(
    () => (outletId ? getSettings(outletId) : Promise.resolve(undefined)),
    [outletId],
    undefined,
  )

  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  if (!staff) return <Navigate to="/login" replace />
  if (staff.role !== 'owner') return <Navigate to="/pos" replace />
  if (!outletId) return <Navigate to="/onboarding" replace />
  if (settings === undefined) return <LoadingState />

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSaved(false)

    const form = new FormData(event.currentTarget)
    try {
      await updateSettings(outletId, {
        sst_enabled: form.get('sst_enabled') === 'on',
        sst_rate_bp: percentStringToBp(String(form.get('sst_rate_percent'))),
        service_charge_enabled: form.get('service_charge_enabled') === 'on',
        service_charge_rate_bp: percentStringToBp(String(form.get('service_charge_rate_percent'))),
        cash_rounding_enabled: form.get('cash_rounding_enabled') === 'on',
        duitnow_qr_url: String(form.get('duitnow_qr_url') || '').trim() || null,
        print_bridge_url: String(form.get('print_bridge_url') || '').trim() || null,
      })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save settings')
    }
  }

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center justify-between">
          <h1 className="text-xl font-semibold text-slate-800">Outlet settings</h1>
          <Link to="/backoffice" className="text-sm text-slate-600 underline">
            Back
          </Link>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-lg bg-white p-4 shadow">
          <fieldset className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="sst_enabled"
                defaultChecked={settings?.sst_enabled}
                className="h-4 w-4"
              />
              <span className="font-medium text-slate-800">SST</span>
            </label>
            <label className="block text-sm text-slate-600">
              Rate (%)
              <input
                name="sst_rate_percent"
                defaultValue={bpToPercentString(settings?.sst_rate_bp ?? 0)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </fieldset>

          <fieldset className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                name="service_charge_enabled"
                defaultChecked={settings?.service_charge_enabled}
                className="h-4 w-4"
              />
              <span className="font-medium text-slate-800">Service charge</span>
            </label>
            <label className="block text-sm text-slate-600">
              Rate (%)
              <input
                name="service_charge_rate_percent"
                defaultValue={bpToPercentString(settings?.service_charge_rate_bp ?? 0)}
                className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
              />
            </label>
          </fieldset>

          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              name="cash_rounding_enabled"
              defaultChecked={settings?.cash_rounding_enabled}
              className="h-4 w-4"
            />
            <span className="font-medium text-slate-800">Round cash totals to nearest 5 sen</span>
          </label>

          <label className="block text-sm text-slate-600">
            DuitNow QR image URL
            <input
              name="duitnow_qr_url"
              defaultValue={settings?.duitnow_qr_url ?? ''}
              placeholder="https://..."
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
          </label>
          {settings?.duitnow_qr_url && (
            <img
              src={settings.duitnow_qr_url}
              alt="DuitNow QR preview"
              className="h-32 w-32 rounded border border-slate-200 object-contain"
            />
          )}

          <label className="block text-sm text-slate-600">
            Print-bridge agent URL
            <input
              name="print_bridge_url"
              defaultValue={settings?.print_bridge_url ?? ''}
              placeholder="http://localhost:7777"
              className="mt-1 w-full rounded border border-slate-300 px-3 py-2"
            />
            <span className="mt-1 block text-xs text-slate-400">
              Address of the print-bridge agent running on this counter's PC. Leave blank to disable
              printing.
            </span>
          </label>

          {error && <p className="text-sm text-red-600">{error}</p>}
          {saved && <p className="text-sm text-green-700">Saved.</p>}

          <button type="submit" className="w-full rounded bg-slate-800 py-2 text-white">
            Save
          </button>
        </form>
      </div>
    </div>
  )
}
