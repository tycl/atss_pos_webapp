import { useEffect, useState } from 'react'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import {
  listMerchantsWithCounts,
  updateMerchantSubscription,
  type MerchantWithCounts,
} from '../../features/platform-admin/api'
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
                  <tr key={merchant.id} className="border-b border-slate-100 last:border-0">
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
                    <td className="px-4 py-3 text-slate-600">{merchant.deviceCount}</td>
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
                ))}
              </tbody>
            </table>
          </Card>
        )}
      </div>
    </div>
  )
}
