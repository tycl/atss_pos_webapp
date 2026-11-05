import { Fragment, useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import {
  listDevicesForMerchant,
  listMerchantsWithCounts,
  setDeviceActive,
  updateMerchantSubscription,
  type MerchantWithCounts,
} from '../../features/platform-admin/api'
import type { Device } from '../../lib/types'
import { supabase } from '../../lib/supabase'

/** `<input type="date">` wants `YYYY-MM-DD`; our columns are full timestamps (or null). */
function toDateInputValue(iso: string | null): string {
  return iso ? iso.slice(0, 10) : ''
}

function fromDateInputValue(value: string): string | null {
  return value === '' ? null : value
}

function isExpired(merchant: MerchantWithCounts): boolean {
  return (
    merchant.subscription_expires_at !== null &&
    new Date(merchant.subscription_expires_at).getTime() < Date.now()
  )
}

export function PlatformAdminHome() {
  const [merchants, setMerchants] = useState<MerchantWithCounts[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [savingId, setSavingId] = useState<string | null>(null)
  const [expandedMerchantId, setExpandedMerchantId] = useState<string | null>(null)
  const [devicesByMerchant, setDevicesByMerchant] = useState<Record<string, Device[]>>({})
  const [devicesLoadingId, setDevicesLoadingId] = useState<string | null>(null)
  const [devicesError, setDevicesError] = useState<string | null>(null)
  const [togglingDeviceId, setTogglingDeviceId] = useState<string | null>(null)

  useEffect(() => {
    void listMerchantsWithCounts()
      .then(setMerchants)
      .catch((err) => setError(err instanceof Error ? err.message : 'Could not load merchants'))
  }, [])

  function updateRow(id: string, patch: Partial<MerchantWithCounts>) {
    setMerchants((rows) => rows?.map((row) => (row.id === id ? { ...row, ...patch } : row)) ?? rows)
  }

  async function handleSave(merchant: MerchantWithCounts) {
    setError(null)
    setSavingId(merchant.id)
    try {
      const saved = await updateMerchantSubscription(merchant.id, {
        plan: merchant.plan,
        status: merchant.status,
        subscription_started_at: merchant.subscription_started_at,
        subscription_expires_at: merchant.subscription_expires_at,
      })
      updateRow(merchant.id, saved)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that merchant')
    } finally {
      setSavingId(null)
    }
  }

  async function handleToggleExpand(merchantId: string) {
    if (expandedMerchantId === merchantId) {
      setExpandedMerchantId(null)
      return
    }

    setExpandedMerchantId(merchantId)
    if (devicesByMerchant[merchantId]) return

    setDevicesError(null)
    setDevicesLoadingId(merchantId)
    try {
      const devices = await listDevicesForMerchant(merchantId)
      setDevicesByMerchant((rows) => ({ ...rows, [merchantId]: devices }))
    } catch (err) {
      setDevicesError(err instanceof Error ? err.message : 'Could not load devices')
    } finally {
      setDevicesLoadingId(null)
    }
  }

  async function handleToggleDeviceActive(merchantId: string, device: Device) {
    setDevicesError(null)
    setTogglingDeviceId(device.id)
    try {
      const saved = await setDeviceActive(device.id, !device.active)
      setDevicesByMerchant((rows) => ({
        ...rows,
        [merchantId]: rows[merchantId].map((d) => (d.id === saved.id ? saved : d)),
      }))
      updateRow(merchantId, {
        deviceCount:
          (merchants?.find((m) => m.id === merchantId)?.deviceCount ?? 0) + (saved.active ? 1 : -1),
      })
    } catch (err) {
      setDevicesError(err instanceof Error ? err.message : 'Could not update that device')
    } finally {
      setTogglingDeviceId(null)
    }
  }

  const activeDeviceTotal = merchants?.reduce((sum, m) => sum + m.deviceCount, 0) ?? 0
  const basicPlanCount = merchants?.filter((m) => m.plan === 'basic').length ?? 0
  const standardPlanCount = merchants?.filter((m) => m.plan === 'standard').length ?? 0

  return (
    <div className="min-h-screen bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-800">Platform admin</h1>
            <p className="text-sm text-slate-500">Every merchant using the POS, and their plan.</p>
          </div>
          <Button variant="outline" onClick={() => void supabase.auth.signOut()}>
            Sign out
          </Button>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        {merchants === null && !error && <p className="text-sm text-slate-500">Loading…</p>}

        {merchants && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Card>
              <p className="text-xs text-slate-500">Active devices</p>
              <p className="text-lg font-semibold text-slate-800">{activeDeviceTotal}</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Basic plan merchants</p>
              <p className="text-lg font-semibold text-slate-800">{basicPlanCount}</p>
            </Card>
            <Card>
              <p className="text-xs text-slate-500">Standard plan merchants</p>
              <p className="text-lg font-semibold text-slate-800">{standardPlanCount}</p>
            </Card>
          </div>
        )}

        {merchants && (
          <Card padding="none" className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-left text-sm">
              <thead className="border-b border-slate-200 text-xs uppercase text-slate-500">
                <tr>
                  <th className="px-4 py-3">Merchant</th>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Subscription start</th>
                  <th className="px-4 py-3">Subscription expires</th>
                  <th className="px-4 py-3">Outlets</th>
                  <th className="px-4 py-3">Devices</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {merchants.map((merchant) => (
                  <Fragment key={merchant.id}>
                    <tr className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-800">
                        {merchant.name}
                        {isExpired(merchant) && (
                          <span className="ml-2 rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-700">
                            Expired
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={merchant.plan}
                          onChange={(e) =>
                            updateRow(merchant.id, {
                              plan: e.target.value as MerchantWithCounts['plan'],
                            })
                          }
                          className="rounded border border-slate-300 px-2 py-1"
                        >
                          <option value="basic">Basic</option>
                          <option value="standard">Standard</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <select
                          value={merchant.status}
                          onChange={(e) =>
                            updateRow(merchant.id, {
                              status: e.target.value as MerchantWithCounts['status'],
                            })
                          }
                          className="rounded border border-slate-300 px-2 py-1"
                        >
                          <option value="active">Active</option>
                          <option value="suspended">Suspended</option>
                        </select>
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="date"
                          value={toDateInputValue(merchant.subscription_started_at)}
                          onChange={(e) =>
                            updateRow(merchant.id, {
                              subscription_started_at: fromDateInputValue(e.target.value),
                            })
                          }
                          className="rounded border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="px-4 py-3">
                        <input
                          type="date"
                          value={toDateInputValue(merchant.subscription_expires_at)}
                          onChange={(e) =>
                            updateRow(merchant.id, {
                              subscription_expires_at: fromDateInputValue(e.target.value),
                            })
                          }
                          className="rounded border border-slate-300 px-2 py-1"
                        />
                      </td>
                      <td className="px-4 py-3 text-slate-600">{merchant.outletCount}</td>
                      <td className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => void handleToggleExpand(merchant.id)}
                          className="text-slate-600 underline"
                        >
                          {merchant.deviceCount}
                          {expandedMerchantId === merchant.id ? ' ▴' : ' ▾'}
                        </button>
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          size="md"
                          disabled={savingId === merchant.id}
                          onClick={() => void handleSave(merchant)}
                        >
                          {savingId === merchant.id ? 'Saving…' : 'Save'}
                        </Button>
                      </td>
                    </tr>
                    {expandedMerchantId === merchant.id && (
                      <tr className="border-b border-slate-100 bg-slate-50 last:border-0">
                        <td colSpan={8} className="px-4 py-3">
                          {devicesLoadingId === merchant.id && (
                            <p className="text-sm text-slate-500">Loading devices…</p>
                          )}
                          {devicesError && <p className="text-sm text-red-600">{devicesError}</p>}
                          {devicesByMerchant[merchant.id] &&
                            (devicesByMerchant[merchant.id].length === 0 ? (
                              <p className="text-sm text-slate-500">No devices yet.</p>
                            ) : (
                              <table className="w-full text-left text-sm">
                                <thead className="text-xs uppercase text-slate-500">
                                  <tr>
                                    <th className="py-1 pr-4">Label</th>
                                    <th className="py-1 pr-4">Receipt prefix</th>
                                    <th className="py-1 pr-4">Status</th>
                                    <th className="py-1" />
                                  </tr>
                                </thead>
                                <tbody>
                                  {devicesByMerchant[merchant.id].map((device) => (
                                    <tr key={device.id} className="border-t border-slate-200">
                                      <td className="py-1.5 pr-4 text-slate-700">{device.label}</td>
                                      <td className="py-1.5 pr-4 text-slate-500">
                                        {device.receipt_prefix}
                                      </td>
                                      <td className="py-1.5 pr-4">
                                        <span
                                          className={
                                            device.active
                                              ? 'rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-700'
                                              : 'rounded-full bg-slate-200 px-2 py-0.5 text-xs font-medium text-slate-600'
                                          }
                                        >
                                          {device.active ? 'Active' : 'Inactive'}
                                        </span>
                                      </td>
                                      <td className="py-1.5">
                                        <Button
                                          variant={device.active ? 'danger-outline' : 'outline'}
                                          size="md"
                                          disabled={togglingDeviceId === device.id}
                                          onClick={() =>
                                            void handleToggleDeviceActive(merchant.id, device)
                                          }
                                        >
                                          {togglingDeviceId === device.id
                                            ? 'Saving…'
                                            : device.active
                                              ? 'Deactivate'
                                              : 'Reactivate'}
                                        </Button>
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            ))}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}
